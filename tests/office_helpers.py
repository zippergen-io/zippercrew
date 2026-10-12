from playwright.sync_api import expect


def prepare_room(page, project, brief, name="My room", *, real=False):
    """Configure through the room objects, leaving the task editor open."""
    page.wait_for_function("() => studio.session?.initialized && !studio.session.busy")
    if page.locator("#studio-menu").is_hidden():
        page.locator("#menu-toggle").click()
    page.locator("#show-rooms").click()
    page.get_by_role("button", name="+ New room", exact=True).click()
    page.locator("#setup-name").fill(name)
    page.get_by_role("button", name="Review", exact=True).click()
    expect(page.locator("#detail-dialog")).not_to_be_visible()
    page.locator("#room-name").click()
    page.get_by_label("Repository", exact=True).fill(str(project))
    page.locator("#close-detail").click()
    expect(page.locator("#detail-dialog")).not_to_be_visible()
    for actor, role, prompt in [
        ("worker", "Implementer", "Keep the change small."),
        ("reviewer", "Reviewer", "Check the edge cases."),
    ]:
        page.evaluate("(id) => {studio.select(id);}", actor)
        if real:
            page.get_by_label("Model", exact=True).select_option(label="Codex built-in default")
        page.locator(".agent-instructions summary").click()
        page.locator(f"#instructions-{role}").fill(prompt)
        page.get_by_role("button", name="Save agent", exact=True).click()
        expect(page.locator("#person-card")).not_to_be_visible()
        page.wait_for_function("() => !studio.session.busy")
    page.evaluate("() => {studio.session.configuration.editTask();}")
    page.locator("#setup-brief").fill(brief)
