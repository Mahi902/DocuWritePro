/*
 * Ribbons & Tabs
 * Sugarcane Add-on
 */
(function () {
    "use strict";

    const state = {
        applied: false,
        originalToolbar: null,
        originalSidebar: null,
        originalToolbarChildren: [],
        originalSidebarChildren: [],
        shell: null,
        expandBtn: null
    };

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    function getIcon(element) {
        if (!element) return "";

        const icon = element.querySelector(".material-symbols-outlined");

        return icon ? icon.textContent.trim() : "";
    }

    function createTab(name, tabs, content) {
        const button = makeElement("button", "sca-ribbon-tab", name);
        button.type = "button";
        button.dataset.tab = name;

        const panel = makeElement("div", "sca-ribbon-panel");
        panel.dataset.panel = name;

        button.addEventListener("click", function () {
            activateTab(name, tabs, content);
        });

        tabs.appendChild(button);
        content.appendChild(panel);

        return panel;
    }

    function activateTab(name, tabs, content) {
        tabs.querySelectorAll(".sca-ribbon-tab").forEach(function (tab) {
            tab.classList.toggle("active", tab.dataset.tab === name);
        });

        content.querySelectorAll(".sca-ribbon-panel").forEach(function (panel) {
            panel.classList.toggle("active", panel.dataset.panel === name);
        });
    }

    function createGroup(label) {
        const group = makeElement("div", "sca-ribbon-group");
        group.dataset.label = label;

        return group;
    }

    function moveToGroup(group, elements) {
        elements.filter(Boolean).forEach(function (element) {
            group.appendChild(element);
        });
    }

    function findToolbarButton(toolbar, iconName) {
        return Array.from(toolbar.children).find(function (element) {
            return getIcon(element) === iconName;
        });
    }

    function buildRibbon() {
        const toolbar = document.querySelector(".toolbar");
        const sidebar = document.getElementById("sidebar");

        if (!toolbar || !sidebar) {
            return false;
        }

        if (document.getElementById("scaRibbonShell")) {
            return true;
        }

        state.originalToolbar = toolbar;
        state.originalSidebar = sidebar;
        state.originalToolbarChildren = Array.from(toolbar.children);
        state.originalSidebarChildren = Array.from(sidebar.children);
        state.expandBtn = document.getElementById("expandBtn");

        const shell = document.createElement("div");
        shell.id = "scaRibbonShell";

        const tabs = document.createElement("div");
        tabs.id = "scaRibbonTabs";

        const content = document.createElement("div");
        content.id = "scaRibbonContent";

        const collapseButton = document.createElement("button");
        collapseButton.id = "scaRibbonCollapse";
        collapseButton.type = "button";
        collapseButton.title = "Collapse ribbon";

        const collapseIcon = document.createElement("span");
        collapseIcon.className = "material-symbols-outlined";
        collapseIcon.textContent = "keyboard_double_arrow_up";

        collapseButton.appendChild(collapseIcon);

        collapseButton.addEventListener("click", function () {
            const collapsed = shell.classList.toggle("sca-ribbon-collapsed");

            collapseButton.title = collapsed
                ? "Expand ribbon"
                : "Collapse ribbon";

            collapseIcon.textContent = collapsed
                ? "keyboard_double_arrow_down"
                : "keyboard_double_arrow_up";
        });

        shell.appendChild(tabs);
        shell.appendChild(content);
        shell.appendChild(collapseButton);

        /*
         * TEXT TAB
         */

        const textPanel = createTab("Text", tabs, content);
        const textGroup = createGroup("Text");

        const formatBlockButton = document.getElementById("formatBlockBtn");
        const fontSizeGroup = toolbar.querySelector(".size-group");
        const fontChooserButton = document.getElementById("fontChooserToolbarBtn");
        const textColorButton = document.getElementById("textColor_btn");
        const highlightColorButton = document.getElementById("highlightColor_btn");

        const boldButton = findToolbarButton(toolbar, "format_bold");
        const italicButton = findToolbarButton(toolbar, "format_italic");
        const underlineButton = findToolbarButton(toolbar, "format_underlined");
        const strikeButton = findToolbarButton(toolbar, "strikethrough_s");
        const clearButton = findToolbarButton(toolbar, "format_clear");

        moveToGroup(textGroup, [
            formatBlockButton,
            fontSizeGroup,
            fontChooserButton,
            textColorButton,
            highlightColorButton,
            boldButton,
            italicButton,
            underlineButton,
            strikeButton,
            clearButton
        ]);

        textPanel.appendChild(textGroup);

        /*
         * ALIGNMENT TAB
         */

        const alignmentPanel = createTab("Alignment", tabs, content);
        const alignmentGroup = createGroup("Alignment");

        const alignLeft = findToolbarButton(toolbar, "format_align_left");
        const alignCenter = findToolbarButton(toolbar, "format_align_center");
        const alignRight = findToolbarButton(toolbar, "format_align_right");
        const alignJustify = findToolbarButton(toolbar, "format_align_justify");
        const indentDecrease = findToolbarButton(toolbar, "format_indent_decrease");
        const indentIncrease = findToolbarButton(toolbar, "format_indent_increase");

        moveToGroup(alignmentGroup, [
            alignLeft,
            alignCenter,
            alignRight,
            alignJustify,
            indentDecrease,
            indentIncrease
        ]);

        alignmentPanel.appendChild(alignmentGroup);

        /*
         * INSERT TAB
         */

        const insertPanel = createTab("Insert", tabs, content);
        const insertGroup = createGroup("Insert");

        const unorderedList = document.getElementById("tbUlBtn");
        const orderedList = document.getElementById("tbOlBtn");
        const horizontalRule = document.getElementById("tbHrBtn");
        const insertDropdown = document.getElementById("insertDdBtn");

        moveToGroup(insertGroup, [
            unorderedList,
            orderedList,
            horizontalRule,
            insertDropdown
        ]);

        insertPanel.appendChild(insertGroup);

        /*
         * HISTORY TAB
         */

        const historyPanel = createTab("History", tabs, content);
        const historyGroup = createGroup("History");

        const undoButton = findToolbarButton(toolbar, "undo");
        const redoButton = findToolbarButton(toolbar, "redo");

        moveToGroup(historyGroup, [
            undoButton,
            redoButton
        ]);

        historyPanel.appendChild(historyGroup);

        /*
         * SIDEBAR TABS
         *
         * Every direct sidebar section becomes its own ribbon tab.
         */

        const sidebarSections = Array.from(
            sidebar.querySelectorAll(":scope > .sb-section")
        );

        sidebarSections.forEach(function (section, index) {
            let name = "Panel " + (index + 1);

            const headerLabel = section.querySelector(".aw-header-label");

            if (headerLabel && headerLabel.textContent.trim()) {
                name = headerLabel.textContent.trim();
            }

            const panel = createTab(name, tabs, content);
            panel.classList.add("sca-ribbon-sidebar-panel");

            panel.appendChild(section);
        });

        /*
         * Place the ribbon where the original toolbar was.
         */

        toolbar.parentNode.insertBefore(shell, toolbar);

        toolbar.style.display = "none";
        toolbar.dataset.scaRibbonHidden = "true";

        sidebar.classList.add("sca-ribbon-source-sidebar");

        if (state.expandBtn) {
            state.expandBtn.classList.add("sca-ribbon-hide-expand");
        }

        state.shell = shell;
        state.applied = true;

        activateTab("Text", tabs, content);

        return true;
    }

    function revertRibbon() {
        if (!state.applied) {
            return;
        }

        const toolbar = state.originalToolbar;
        const sidebar = state.originalSidebar;

        if (toolbar) {
            state.originalToolbarChildren.forEach(function (element) {
                if (element && element.parentNode !== toolbar) {
                    toolbar.appendChild(element);
                }
            });

            toolbar.style.display = "";
            delete toolbar.dataset.scaRibbonHidden;
        }

        if (sidebar) {
            state.originalSidebarChildren.forEach(function (element) {
                if (element && element.parentNode !== sidebar) {
                    sidebar.appendChild(element);
                }
            });

            sidebar.classList.remove("sca-ribbon-source-sidebar");
        }

        if (state.expandBtn) {
            state.expandBtn.classList.remove("sca-ribbon-hide-expand");
        }

        if (state.shell) {
            state.shell.remove();
        }

        state.shell = null;
        state.applied = false;
    }

    function start() {
        if (!buildRibbon()) {
            setTimeout(start, 60);
        }
    }

    window.__SCA_RIBBONS_TABS_REVERT__ = revertRibbon;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, {
            once: true
        });
    } else {
        start();
    }
})();
