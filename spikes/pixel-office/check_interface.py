"""Exercise the contextual interface through browser clicks, focus and keys."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

HERE=Path(__file__).parent
URL='http://127.0.0.1:8774/spikes/pixel-office/'

def click_world(page,x,y):
    box=page.locator('#game canvas').bounding_box()
    page.mouse.click(box['x']+x*box['width']/560,box['y']+y*box['height']/352)

def human(page):
    return page.evaluate("({x:studio.people.get('human').x,y:studio.people.get('human').y,route:studio.people.get('human').route})")

with sync_playwright() as pw:
    browser=pw.chromium.launch()
    page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=2,reduced_motion='reduce')
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('window.studio?.ready')
    assert page.locator('.workspace').bounding_box()=={'x':0,'y':0,'width':1440,'height':960}
    for panel in ['person-card','task-card','people-popover','studio-menu']:
        expect(page.locator('#'+panel)).to_be_hidden()
    assert page.evaluate('Number.isInteger(studio.physicalScale)')
    page.screenshot(path=str(HERE/'captures'/'office-interface-day.png'))
    before=human(page)

    click_world(page,368,187)
    expect(page.locator('#person-card')).to_be_visible()
    expect(page.locator('#person-name')).to_have_text('Mira')
    assert page.evaluate("studio.selected==='planner'")
    assert human(page)==before,'Selecting an agent moved the human'
    page.keyboard.press('ArrowRight')
    assert human(page)==before,'Overlay keyboard input reached the world'
    # The card stays stationary while the person moves in the simulation.
    card=page.locator('#person-card').bounding_box()
    assert 0<=card['x'] and card['x']+card['width']<=1440
    page.mouse.click(card['x']+20,card['y']+100)
    page.screenshot(path=str(HERE/'captures'/'office-agent-day.png'))
    page.locator('[data-mood-choice="night"]').click()
    expect(page.locator('#person-card')).to_be_visible()
    assert human(page)==before,'Mood switch changed movement'
    page.screenshot(path=str(HERE/'captures'/'office-agent-night.png'))
    page.locator('#person-task').click()
    expect(page.locator('#detail-dialog')).to_be_visible()
    expect(page.locator('#detail-title')).to_have_text('Shape the next small release')
    for _ in range(5):
        page.keyboard.press('Tab')
        assert page.evaluate("document.getElementById('detail-dialog').contains(document.activeElement)")
    page.keyboard.press('ArrowDown')
    assert human(page)==before,'Modal input reached the world'
    page.screenshot(path=str(HERE/'captures'/'office-task-night.png'))
    page.keyboard.press('Escape')
    expect(page.locator('#detail-dialog')).to_be_hidden()
    expect(page.locator('#game')).to_be_focused()
    print('PASS agent card, task window, day/night, focus containment and no input leakage',flush=True)

    # Every existing desk gets its context from its owner data, not its position.
    for owner,x,y,name in [('planner',110,138,'Mira'),('worker',242,138,'Theo'),('reviewer',110,230,'Jules'),('human',242,230,'Your')]:
        click_world(page,x,y)
        expect(page.locator('#task-card')).to_be_visible()
        assert name in page.locator('#task-location').inner_text()
        assert human(page)==before,'Clicking a desk started walking'
        if owner=='worker':page.screenshot(path=str(HERE/'captures'/'office-desk-night.png'))
        page.locator('#close-task').click()
    page.locator('#people-toggle').click()
    page.locator('[data-person="reviewer"]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#person-name')).to_have_text('Jules')
    expect(page.locator('#people-popover')).to_be_hidden()
    page.keyboard.press('Escape')
    expect(page.locator('#person-card')).to_be_hidden()
    page.locator('#menu-toggle').click()
    page.locator('#show-history').click()
    expect(page.locator('#detail-title')).to_have_text('Recent activity')
    expect(page.locator('.activity-list')).to_contain_text('Mira')
    page.locator('#back-to-office').click()
    page.locator('#menu-toggle').click()
    page.keyboard.press('Escape')
    expect(page.locator('#menu-toggle')).to_be_focused()
    expect(page.locator('#studio-menu')).to_be_hidden()
    # A pan/drag beginning on a desk must not open its card on release.
    box=page.locator('#game canvas').bounding_box()
    page.mouse.move(box['x']+110*box['width']/560,box['y']+138*box['height']/352)
    page.mouse.down()
    page.mouse.move(box['x']+138*box['width']/560,box['y']+143*box['height']/352,steps=6)
    page.mouse.up()
    expect(page.locator('#task-card')).to_be_hidden()
    assert human(page)==before,'A drag was treated as a floor click'
    print('PASS four contextual desks, keyboard roster, session history and dismiss controls',flush=True)

    page.locator('#people-toggle').click()
    page.locator('[data-person="planner"]').click()
    page.locator('#walk-over').click()
    expect(page.locator('#person-card')).to_be_hidden()
    page.wait_for_function("!studio.people.get('human').route.length",timeout=15000)
    assert page.evaluate("Math.hypot(studio.people.get('human').x-studio.people.get('planner').x,studio.people.get('human').y-studio.people.get('planner').y)<38")
    page.locator('#menu-toggle').click()
    page.locator('#sit').click()
    expect(page.locator('#studio-menu')).to_be_hidden()
    page.wait_for_function("studio.people.get('human').seated&&!studio.people.get('human').transition",timeout=15000)
    print('PASS Walk over and Take a seat still use real world movement',flush=True)

    # Small-screen panels remain in view and selecting a person pans to them.
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_function('studio.physicalScale>=devicePixelRatio')
    page.locator('#people-toggle').click()
    page.locator('[data-person="planner"]').click()
    panel=page.locator('#person-card').bounding_box()
    assert 0<=panel['x'] and panel['x']+panel['width']<=390
    assert 64<=panel['y'] and panel['y']+panel['height']<=844
    assert page.evaluate('document.documentElement.scrollWidth===innerWidth')
    page.screenshot(path=str(HERE/'captures'/'office-mobile-night.png'))
    page.locator('#person-task').click()
    dialog=page.locator('#detail-dialog').bounding_box()
    assert 0<=dialog['x'] and dialog['x']+dialog['width']<=390
    page.keyboard.press('Escape')
    page.locator('[data-mood-choice="day"]').click()
    page.screenshot(path=str(HERE/'captures'/'office-mobile-day.png'))
    print('PASS mobile cards, modal bounds and no page overflow',flush=True)
    assert not errors,errors
    browser.close()
    print('PASS no browser errors')
