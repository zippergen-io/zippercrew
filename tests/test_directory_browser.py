from pathlib import Path
from urllib.parse import urlencode

from conftest import request


def test_directory_browser_lists_only_folders_and_handles_navigation(service):
    _, base, project = service
    child = project / "Client app #1"
    child.mkdir()
    (project / "archive").mkdir()
    (project / ".git").mkdir()
    (project / "private.txt").write_text("Not folder-browser content")

    def browse(path):
        return request(base, "/api/directories?" + urlencode({"path": str(path)}))

    code, result = browse(project)
    assert code == 200
    assert result["path"] == str(project)
    assert result["parent"] == str(project.parent)
    assert result["directories"] == [
        {"name": "archive", "path": str(project / "archive")},
        {"name": child.name, "path": str(child)},
    ]
    assert browse(child)[1]["directories"] == []
    assert browse(child)[1]["parent"] == str(project)
    assert browse(project / "missing")[0] == 400
    assert browse(project / "private.txt")[0] == 400
    assert browse("/")[1]["parent"] is None
    assert browse("~")[1]["path"] == str(Path.home().resolve())
    assert request(base, "/api/directories?path=")[1]["path"] == str(Path.home().resolve())


def test_directory_browser_rejects_cross_origin_reads(service):
    _, base, project = service
    endpoint = "/api/directories?" + urlencode({"path": str(project)})
    assert request(base, endpoint, Origin="https://example.com")[0] == 403
    assert request(base, endpoint, **{"Sec-Fetch-Site": "cross-site"})[0] == 403
    assert request(base, endpoint, Host="example.com")[0] == 403
