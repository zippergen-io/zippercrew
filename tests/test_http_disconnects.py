"""A browser closing a socket is not an application failure."""

import http.client
import socket
import struct
import threading
from contextlib import closing

import pytest
from conftest import request

from zippercrew.server import Handler


@pytest.mark.parametrize("stage", ["before-request", "keep-alive", "request-body"])
def test_browser_reset_is_quiet_and_server_keeps_serving(service, monkeypatch, capsys, stage):
    app, base, _ = service
    waiting = threading.Event()
    finished = threading.Event()
    original_request = Handler.handle_one_request
    original_trusted = Handler.trusted
    original_shutdown = app.shutdown_request

    def handle_one_request(handler):
        count = getattr(handler, "request_count", 0) + 1
        handler.request_count = count
        if (stage == "before-request" and count == 1) or (stage == "keep-alive" and count == 2):
            waiting.set()
        original_request(handler)

    def trusted(handler, mutation=False):
        result = original_trusted(handler, mutation)
        if stage == "request-body" and mutation and result:
            waiting.set()
        return result

    def shutdown_request(connection):
        try:
            original_shutdown(connection)
        finally:
            # Runs after the request thread's error reporting, if any.
            finished.set()

    monkeypatch.setattr(Handler, "handle_one_request", handle_one_request)
    monkeypatch.setattr(Handler, "trusted", trusted)
    monkeypatch.setattr(app, "shutdown_request", shutdown_request)
    with socket.create_connection(app.server_address, timeout=5) as connection:
        host = f"Host: 127.0.0.1:{app.server_port}\r\n"
        if stage == "keep-alive":
            connection.sendall(f"GET /api/bootstrap HTTP/1.1\r\n{host}\r\n".encode())
            with http.client.HTTPResponse(connection) as response:
                response.begin()
                assert response.status == 200
                response.read()
        elif stage == "request-body":
            connection.sendall(
                (
                    f"POST /api/rooms HTTP/1.1\r\n{host}"
                    "Content-Type: application/json\r\nX-ZipperCrew: 1\r\n"
                    'Content-Length: 100\r\n\r\n{"'
                ).encode()
            )
        assert waiting.wait(5), "Server never reached the expected read"
        # Closing with zero linger sends an actual TCP reset on macOS and Linux.
        connection.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    assert finished.wait(5), "Disconnected request did not finish"
    assert capsys.readouterr().err == ""
    assert request(base, "/api/bootstrap")[0] == 200
    assert request(base, "/api/rooms")[1] == [], "An incomplete POST must not create a room"


@pytest.mark.parametrize(
    "error,reported",
    [
        (BrokenPipeError("client stopped reading"), False),
        (ConnectionAbortedError("connection aborted"), False),
        (RuntimeError("unexpected bug"), True),
        (OSError("unexpected IO error"), True),
    ],
)
def test_request_errors_only_silence_disconnects(service, monkeypatch, capsys, error, reported):
    app, base, _ = service
    finished = threading.Event()
    original_get = Handler.do_GET
    original_shutdown = app.shutdown_request

    def do_get(handler):
        if handler.path == "/test-error":
            raise error
        original_get(handler)

    def shutdown_request(connection):
        try:
            original_shutdown(connection)
        finally:
            finished.set()

    monkeypatch.setattr(Handler, "do_GET", do_get)
    monkeypatch.setattr(app, "shutdown_request", shutdown_request)
    with closing(http.client.HTTPConnection(*app.server_address, timeout=5)) as connection:
        connection.request("GET", "/test-error")
        with pytest.raises(http.client.RemoteDisconnected):
            connection.getresponse()
    assert finished.wait(5)
    output = capsys.readouterr().err
    if reported:
        assert "Traceback" in output
        assert str(error) in output
    else:
        assert output == ""
    assert request(base, "/api/bootstrap")[0] == 200
