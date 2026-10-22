import asyncio, glob, pathlib
from playwright.async_api import async_playwright

here = pathlib.Path(__file__).resolve().parent
out = here.parent.parent / "assets/img/og.png"
exe = glob.glob(str(pathlib.Path.home() / ".cache/ms-playwright/chromium-*/chrome-linux64/chrome"))[0]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=exe, args=["--allow-file-access-from-files"])
        page = await browser.new_page(viewport={"width": 1200, "height": 630})
        await page.goto((here / "og.html").as_uri())
        await page.evaluate("document.fonts.ready")
        await page.locator(".og").screenshot(path=str(out))
        await browser.close()

asyncio.run(main())
