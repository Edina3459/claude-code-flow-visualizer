import sys, time
from playwright.sync_api import sync_playwright

SP = "/tmp/claude-1000/-home-oye-Documents-free-work-personal-agent-v2/b4f50440-09ca-4069-a721-d73ce0ec1082/scratchpad"
URL = "http://localhost:5173"
errors = []

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda m: errors.append(f"[console.{m.type}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

        # 1. initial load / empty state
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        assert page.locator("text=See the whole harness").count() == 1, "empty state missing"
        page.screenshot(path=f"{SP}/01_empty.png")
        print("PASS 1: empty state renders")

        # 2. demo harness
        page.click("text=LOAD DEMO HARNESS")
        page.wait_for_timeout(1500)
        nodes = page.locator("div.absolute.rounded-xl").count()
        assert nodes >= 10, f"demo graph too small: {nodes} nodes"
        assert page.locator("text=demo/loomline").count() >= 1, "parse strip missing"
        page.screenshot(path=f"{SP}/02_demo.png")
        print(f"PASS 2: demo graph renders ({nodes} node cards)")

        # 2b. click a node -> inspector
        page.click("text=orchestrator")
        page.wait_for_timeout(500)
        assert page.locator("text=DESCRIPTION · TRIGGER").count() == 1, "inspector missing"
        # source file tab
        page.click("text=source file")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{SP}/03_inspector.png")
        print("PASS 2b: inspector opens with tabs")
        page.keyboard.press("Escape")
        page.click("button:has(svg.lucide-x)")  # close inspector
        page.wait_for_timeout(300)

        # 2c. lints panel
        page.click("text=/LINT|ALL CHECKS/")
        page.wait_for_timeout(400)
        assert page.locator("text=PIPELINE LINTS").count() == 1, "lint panel missing"
        print("PASS 2c: lint panel opens")

        # 3. GitHub load — the target harness repo
        page.fill("input[placeholder*='github.com']", "https://github.com/Chachamaru127/claude-code-harness.git")
        page.get_by_role("button", name="VISUALIZE", exact=True).click()
        # wait until loading overlay disappears (max 120s)
        page.wait_for_selector("text=Chachamaru127/claude-code-harness", timeout=240000)
        page.wait_for_selector(".animate-spin", state="detached", timeout=240000)
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{SP}/04_github.png", full_page=False)
        err_box = page.locator("text=/Couldn't|rate limit|not found|blocked/i")
        if err_box.count():
            print("GITHUB LOAD ERROR:", err_box.first.inner_text())
        strip = page.locator("text=Chachamaru127/claude-code-harness")
        assert strip.count() >= 1, "github repo did not load into parse strip"
        nodes = page.locator("div.absolute.rounded-xl").count()
        print(f"PASS 3: github repo visualized ({nodes} node cards)")

        # 4. ZIP upload
        page.locator("input[accept='.zip']").set_input_files(f"{SP}/harness.zip")
        page.wait_for_selector("text=zip/harness", timeout=240000)
        page.wait_for_selector(".animate-spin", state="detached", timeout=240000)
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SP}/05_zip.png")
        assert page.locator("text=zip/harness").count() >= 1, "zip did not load"
        nodes = page.locator("div.absolute.rounded-xl").count()
        print(f"PASS 4: ZIP upload visualized ({nodes} node cards)")

        browser.close()

try:
    run()
finally:
    if errors:
        print("\n--- BROWSER ERRORS ---")
        for e in errors[:30]:
            print(e)
    else:
        print("\nNo browser console/page errors.")
