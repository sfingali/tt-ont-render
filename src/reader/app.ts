import { availableViews, parseStory } from "../content/story.ts";
import { eventAnchor, guideIds, renderFocus, renderReading } from "./render.ts";

const data = document.getElementById("story-data");
if (data) {
  const story = parseStory(JSON.parse(data.textContent || "null"));
  const root = document.getElementById("reading-content")!,
    focus = document.getElementById("focus-content")!,
    notice = document.getElementById("reader-notice")!;
  const select = document.getElementById(
    "view-select",
  ) as HTMLSelectElement | null;
  const views = availableViews(story);
  let activeView = "guide",
    active = guideIds(story)[0];
  let observer: IntersectionObserver | undefined;
  document
    .querySelectorAll<HTMLElement>(".enhancement")
    .forEach((el) => (el.hidden = false));
  const ids = () =>
    [...root.querySelectorAll<HTMLElement>("[data-event]")].map(
      (el) => el.dataset.event!,
    );
  function announce(message: string) {
    notice.textContent = message;
    notice.hidden = !message;
  }
  function activate(id: string, scroll = false, writeUrl = false) {
    const article = [
      ...root.querySelectorAll<HTMLElement>("[data-event]"),
    ].find((el) => el.dataset.event === id);
    if (!article) {
      announce(
        "This moment is not included in this reading order. Choose the guide to return to its full explanation.",
      );
      return;
    }
    active = id;
    root.querySelectorAll<HTMLElement>(".beat").forEach((el) => {
      const on = el.dataset.event === id;
      el.classList.toggle("is-active", on);
      const a = el.querySelector(".beat-number");
      if (on) a?.setAttribute("aria-current", "step");
      else a?.removeAttribute("aria-current");
    });
    focus.innerHTML = renderFocus(story, id);
    (document.getElementById("diagram-download") as HTMLAnchorElement).href =
      `../../diagrams/${story.id}/${id}.svg`;
    const list = ids(),
      index = list.indexOf(id);
    (document.getElementById("previous") as HTMLButtonElement).disabled =
      index <= 0;
    (document.getElementById("next") as HTMLButtonElement).disabled =
      index >= list.length - 1;
    if (scroll)
      article.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    if (writeUrl) {
      const url = new URL(location.href);
      if (activeView === "guide") url.searchParams.delete("view");
      else url.searchParams.set("view", activeView);
      url.hash = eventAnchor(id);
      history.replaceState(null, "", url);
    }
  }
  function observe() {
    observer?.disconnect();
    if (!("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((x) => x.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = (visible[0]?.target as HTMLElement | undefined)?.dataset
          .event;
        if (id && id !== active) activate(id);
      },
      { rootMargin: "-12% 0px -55% 0px", threshold: 0 },
    );
    root.querySelectorAll(".beat").forEach((el) => observer!.observe(el));
  }
  function setView(view: string, preserve = true) {
    const requested = view;
    activeView = views.some((v) => v.id === view) ? view : "guide";
    root.innerHTML = renderReading(story, activeView);
    if (select) select.value = activeView;
    const list = ids();
    const keep = preserve && list.includes(active);
    activate(keep ? active : list[0], false, true);
    observe();
    announce(
      requested !== activeView
        ? "That reading order is unavailable. The guide is shown."
        : preserve && !keep
          ? "This moment is not included in this reading order. Showing its first chapter."
          : "",
    );
  }
  document.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-focus],a.beat-number",
    );
    if (!link) return;
    const id =
      link.dataset.focus ??
      link.closest<HTMLElement>("[data-event]")?.dataset.event;
    if (!id) return;
    event.preventDefault();
    announce("");
    activate(id, true, true);
  });
  document.getElementById("previous")?.addEventListener("click", () => {
    const list = ids();
    activate(list[Math.max(0, list.indexOf(active) - 1)], true, true);
  });
  document.getElementById("next")?.addEventListener("click", () => {
    const list = ids();
    activate(
      list[Math.min(list.length - 1, list.indexOf(active) + 1)],
      true,
      true,
    );
  });
  select?.addEventListener("change", () => setView(select.value));
  document
    .getElementById("print")
    ?.addEventListener("click", () => window.print());
  function readLocation() {
    const url = new URL(location.href);
    const target = url.hash.slice(1);
    const view = url.searchParams.get("view") ?? "guide";
    setView(view, false);
    if (target.startsWith("event-")) {
      const id = story.events.find(
        (ev) =>
          target === eventAnchor(ev.id) ||
          target.startsWith(eventAnchor(ev.id) + "-visit-"),
      )?.id;
      if (id) activate(id, true, true);
      else
        announce(
          "That moment could not be found. The story opening is available above.",
        );
    }
  }
  window.addEventListener("popstate", readLocation);
  window.addEventListener("hashchange", () => {
    const el = document.getElementById(location.hash.slice(1));
    const id = el?.dataset.event;
    if (id) activate(id);
  });
  readLocation();
}
