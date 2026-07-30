const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

function activateView(view, { focus = false, updateHash = true } = {}) {
  const activeTab = tabs.find((tab) => tab.dataset.view === view) ?? tabs[0];

  for (const tab of tabs) {
    const selected = tab === activeTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }

  for (const panel of panels) {
    panel.hidden = panel.dataset.panel !== activeTab.dataset.view;
  }

  if (focus) activeTab.focus();
  if (updateHash) history.replaceState(null, "", `#${activeTab.dataset.view}`);
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => activateView(tab.dataset.view));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    activateView(tabs[nextIndex].dataset.view, { focus: true });
  });
}

const initialView = location.hash.slice(1);
activateView(initialView, { updateHash: false });
