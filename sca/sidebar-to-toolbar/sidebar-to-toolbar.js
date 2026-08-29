/*
 * Sidebar to Toolbar
 * Sugarcane Add-on
 */
(function () {
    "use strict";

    function applySidebarToToolbar() {
        const sidebar = document.getElementById("sidebar");
        const mainToolbar = document.querySelector(".toolbar");

        if (!sidebar || !mainToolbar) {
            return false;
        }

        if (sidebar.dataset.scaSidebarToolbarApplied === "true") {
            return true;
        }

        const originalParent = sidebar.parentNode;
        const originalNextSibling = sidebar.nextSibling;

        sidebar.dataset.scaSidebarToolbarApplied = "true";
        sidebar.dataset.scaSidebarToolbarOriginalParent = "main-content";

        window.__SCA_SIDEBAR_TO_TOOLBAR_REVERT__ = function () {
            if (originalParent && sidebar.parentNode !== originalParent) {
                if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
                    originalParent.insertBefore(sidebar, originalNextSibling);
                } else {
                    originalParent.insertBefore(sidebar, originalParent.firstChild);
                }
            }

            sidebar.classList.remove("sca-sidebar-toolbar");
            delete sidebar.dataset.scaSidebarToolbarApplied;
            delete window.__SCA_SIDEBAR_TO_TOOLBAR_REVERT__;
        };

        sidebar.classList.remove("collapsed");
        sidebar.classList.add("sca-sidebar-toolbar");

        // Put the converted sidebar directly below Sugarcane's main toolbar.
        mainToolbar.insertAdjacentElement("afterend", sidebar);

        // The normal sidebar expand button is no longer useful in toolbar mode.
        const expandButton = document.getElementById("expandBtn");
        if (expandButton) {
            expandButton.style.display = "none";
        }

        return true;
    }

    function start() {
        if (!applySidebarToToolbar()) {
            setTimeout(start, 50);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
