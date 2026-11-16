"""Run with Playwright installed: python archivepro/tests/caption-reader.py."""
import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SITE = "http://localhost:8124"
RECIPIENT = "dungzakcestlavie@gmail.com"
STATUSES = [
    ("available", "소장 가능", "Available"),
    ("available", "소장 가능", "Available"),
    ("collected", "소장됨", "Collected"),
    ("reserved", "예약 중", "Reserved"),
    ("not_for_sale", "비매품", "Not for Sale"),
    ("private", "비공개", "Private"),
    (None, "", ""),
    ("constructor", "", ""),
]
WORKS = [
    {
        "id": f"DZ-{i:03}",
        "section_id": 1,
        "title_kr": f"시험 작품 {i}",
        "title_en": f"Artwork {i}",
        "material_kr": "종이에 먹",
        "material_en": "Ink on paper",
        "size_kr": "75 × 57 cm",
        "size_en": "75 × 57 cm",
        "year": 2026,
        "image": f"/fixture/standard/{i}.svg",
        "zoom": f"/fixture/zoom/{i}.svg",
        "status": status,
    }
    for i, (status, _, _) in enumerate(STATUSES, 1)
]
# The archive requires a source with at least 100 records.
WORKS += [
    {"id": f"fixture-{i}", "section_id": 6, "image": "/fixture/filler.svg"}
    for i in range(100)
]
IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'


def serve_fixture(route):
    url = urlsplit(route.request.url)
    if url.path.endswith("/works.json"):
        route.fulfill(json=WORKS, headers={"access-control-allow-origin": "*"})
    elif url.path.startswith("/fixture/"):
        route.fulfill(content_type="image/svg+xml", body=IMAGE)
    elif url.hostname == "localhost" and (ROOT / url.path[1:]).is_file():
        route.fulfill(path=ROOT / url.path[1:])
    else:
        route.abort()


def open_archive(browser, width, height, **options):
    page = browser.new_page(
        viewport={"width": width, "height": height}, service_workers="block", **options
    )
    page.route("**/*", serve_fixture)
    page.add_init_script(
        "Object.defineProperty(navigator, 'clipboard', { value: {"
        " writeText: async text => { window.lastCopied = text; } } });"
    )
    page.goto(SITE + "/archivepro/index.html", wait_until="domcontentloaded")
    expect(page.locator('.card[data-id="DZ-001"]')).to_be_visible()
    return page


def open_work(page, work_id):
    page.locator(f'.card[data-id="{work_id}"]').click()
    expect(page.locator("#lbId")).to_have_text(work_id)


def open_reader(page):
    page.locator(".dzcr-trigger-work").click()
    expect(page.locator("#dzCaptionReader")).to_be_visible()


def check_layout_and_inquiry(page):
    open_work(page, "DZ-001")
    open_reader(page)
    expect(page.locator('button[data-dzcr-scale="300"]')).to_have_attribute("aria-pressed", "true")
    for mode, title in [("kr", "시험 작품 1"), ("en", "Artwork 1"), ("both", "Artwork 1")]:
        page.locator(f'[data-dzcr-lang="{mode}"]').click()
        expect(page.locator("#dzcrTitle")).to_contain_text(title)
        if mode == "both":
            expect(page.locator("#dzcrTitle [lang=ko]")).to_have_text("시험 작품 1")
            expect(page.locator("#dzcrTitle [lang=en]")).to_have_text("Artwork 1")
        for scale in (100, 150, 200, 300, 400):
            button = page.locator(f'button[data-dzcr-scale="{scale}"]')
            button.click()
            expect(button).to_have_attribute("aria-pressed", "true")
            trigger = page.locator("[data-dzcr=inquiry]")
            trigger.scroll_into_view_if_needed()
            scroller = page.locator(".dzcr-scroll")
            scroll_top = scroller.evaluate("(el) => el.scrollTop")
            trigger.click()
            expect(page.locator("#dzcrInquiryPanel")).to_be_visible()
            assert page.locator("#dzCaptionReader").evaluate(
                """root => {
                    const scroll = root.querySelector('.dzcr-scroll');
                    const bar = root.querySelector('.dzcr-bar').getBoundingClientRect();
                    const panel = root.querySelector('.dzcr-mail-panel');
                    return scroll.scrollWidth <= scroll.clientWidth &&
                        panel.scrollWidth <= panel.clientWidth && bar.top >= 0 &&
                        bar.bottom <= window.innerHeight;
                }"""
            )
            mail, gmail = page.locator("#dzcrInquiryPanel a").all()
            mail_url = urlsplit(mail.get_attribute("href"))
            mail_query = parse_qs(mail_url.query)
            gmail_query = parse_qs(urlsplit(gmail.get_attribute("href")).query)
            assert mail_url.path == gmail_query["to"][0] == RECIPIENT
            assert mail_query["subject"] == gmail_query["su"]
            assert mail_query["body"] == gmail_query["body"]
            body = mail_query["body"][0]
            assert all(value in body for value in ("DZ-001", title, "2026", "75 × 57 cm"))
            if mode == "both":
                assert "시험 작품 1" in body and "Ink on paper" in body
            if scale == 400:
                page.locator("[data-dzcr=copy-address]").click()
                assert page.evaluate("lastCopied") == RECIPIENT
                page.locator("[data-dzcr=copy-inquiry]").click()
                assert body in page.evaluate("lastCopied")
            page.keyboard.press("Escape")
            expect(page.locator("#dzcrInquiryPanel")).to_be_hidden()
            expect(trigger).to_be_focused()
            assert abs(scroller.evaluate("(el) => el.scrollTop") - scroll_top) <= 1
    page.locator(".dzcr-bar [data-dzcr=close]").click()
    expect(page.locator("#dzCaptionReader")).to_be_hidden()
    open_reader(page)
    expect(page.locator('button[data-dzcr-scale="400"]')).to_have_attribute("aria-pressed", "true")
    expect(page.locator('[data-dzcr-lang="both"]')).to_have_attribute("aria-pressed", "true")


def check_return_and_status(page):
    open_work(page, "DZ-002")
    for close in ("button", "escape", "history"):
        open_reader(page)
        for _ in range(3):
            page.locator(".dzcr-bar [data-dzcr=next]").click()
        expect(page.locator(".dzcr-row-code")).to_contain_text("DZ-005")
        if close == "button":
            page.locator(".dzcr-bar [data-dzcr=close]").click()
        elif close == "escape":
            page.keyboard.press("Escape")
        else:
            page.go_back()
        expect(page.locator("#dzCaptionReader")).to_be_hidden()
        expect(page.locator("#lbId")).to_have_text("DZ-005")
        expect(page.locator("#lightboxImage")).to_have_attribute(
            "src", re.compile(r"/fixture/zoom/5\.svg")
        )
        expect(page.locator(".dzcr-trigger-work")).to_be_focused()
        open_reader(page)
        for _ in range(3):
            page.locator(".dzcr-bar [data-dzcr=prev]").click()
        page.keyboard.press("Escape")
        expect(page.locator("#lbId")).to_have_text("DZ-002")
    expected = ["소장 가능", "소장됨", "예약 중", "비매품", "비공개", "", ""]
    for offset, label in enumerate(expected, 2):
        card = page.locator(f'.card[data-id="DZ-{offset:03}"]')
        viewer = page.locator("#lbCollectionStatus")
        if label:
            expect(card.locator(".status-label")).to_contain_text(label)
            expect(viewer).to_contain_text(label)
        else:
            expect(card.locator(".status-label")).to_have_count(0)
            expect(viewer).to_be_hidden()
        open_reader(page)
        status = page.locator(".dzcr-row-status")
        if label:
            expect(status).to_contain_text(label)
        else:
            expect(status).to_have_count(0)
        inquiry = expect(page.locator("[data-dzcr=inquiry]"))
        if offset == 2:
            inquiry.to_be_visible()
        else:
            inquiry.to_be_hidden()
        if offset < len(STATUSES):
            page.locator(".dzcr-bar [data-dzcr=next]").click()
        page.keyboard.press("Escape")
        expect(page.locator("#dzCaptionReader")).to_be_hidden()


if __name__ == "__main__":
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_BIN"))
        for width, height in ((320, 240), (390, 650), (744, 1133), (1280, 800)):
            page = open_archive(browser, width, height)
            check_layout_and_inquiry(page)
            page.close()
            print(f"PASS {width} × {height}, all 15 language/scale combinations", flush=True)
        page = open_archive(browser, 900, 700)
        check_return_and_status(page)
        print("PASS close button, Escape, browser Back, artwork image, focus, collection status")
