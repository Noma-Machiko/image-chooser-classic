import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { send_message, send_cancel } from "./image_chooser_messaging.js";

const EVENT_NAME = "cg-image-chooser-classic-widget";
const activeWidgets = new Map();
let currentActiveNode = null;

function ensureStyles() {
    if (document.getElementById("cg-image-chooser-widget-style")) return;
    const style = document.createElement("style");
    style.id = "cg-image-chooser-widget-style";
    style.textContent = `
    .cg-chooser-widget {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
        padding: 12px;
    }
    .cg-chooser-grid {
        display: grid;
        gap: 6px;
        width: 100%;
    }
    .cg-chooser-cell {
        position: relative;
        border-radius: 6px;
        border: 2px solid transparent;
        overflow: hidden;
        background: #151515;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .cg-chooser-cell.selected {
        border-color: #4caf50;
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.4);
    }
    .cg-chooser-cell img {
        width: 100%;
        height: auto;
        max-height: 100%;
        object-fit: contain;
        display: block;
    }
    .cg-chooser-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
    }
    .cg-chooser-footer button {
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 13px;
    }
    .cg-chooser-progress {
        background: #4caf50;
        color: #101010;
    }
    .cg-chooser-progress:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .cg-chooser-cancel {
        background: #c54a4a;
        color: #fff;
    }
    `;
    document.head.appendChild(style);
}

function findNode(detail) {
    if (!app.graph) return null;
    const graph = app.graph;
    const candidates = [];
    if (detail.display_id !== undefined && detail.display_id !== null) candidates.push(detail.display_id);
    if (detail.unique_id) {
        candidates.push(detail.unique_id);
        const parts = detail.unique_id.split(":");
        if (parts.length > 1) candidates.push(parts[0], parts.at(-1));
    }
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) continue;
        const key = candidate.toString();
        const node = graph._nodes_by_id?.[key];
        if (node?.isImageChooserClassicWidget) return node;
    }
    const nodes = graph._nodes ?? [];
    return nodes.find((n) => n?.isImageChooserClassicWidget && (n._ic_unique_id === detail.unique_id));
}

function ensureWidget(node) {
    let info = activeWidgets.get(node.id);
    if (info) return info;

    const container = document.createElement("div");
    container.className = "cg-chooser-widget";

    const domWidget = node.addDOMWidget("Chooser", "cg-image-chooser", container, {
        getValue() {
            return null;
        },
        setValue() {},
    });
    domWidget.serialize = false;

    info = {
        container,
        domWidget,
        grid: null,
        progressBtn: null,
        cancelBtn: null,
    };
    activeWidgets.set(node.id, info);

    const originalOnRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
        activeWidgets.delete(this.id);
        if (currentActiveNode === this) currentActiveNode = null;
        domWidget.onRemove?.();
        return originalOnRemoved?.apply(this, args);
    };

    return info;
}

function determineLayout(node, detail) {
    const minWidth = 280;
    const maxWidth = 420;
    const minCell = 70;
    const gap = 6;
    const padding = 12;
    const footerHeight = 42;
    const maxHeight = 420;

    const currentWidth = node.size?.[0] ?? minWidth;
    const targetWidth = Math.min(maxWidth, Math.max(minWidth, currentWidth));
    const imageCount = Math.max(1, detail.urls?.length ?? 0);

    const usableWidth = targetWidth - padding * 2 + gap;
    const maxColumns = Math.max(1, Math.floor(usableWidth / (minCell + gap)));
    const columns = Math.min(imageCount, Math.max(1, maxColumns));
    const rows = Math.ceil(imageCount / columns);

    const availableWidth = targetWidth - padding * 2 - (columns - 1) * gap;
    const cellWidth = Math.max(minCell, availableWidth / columns);

    const gridWidth = columns * cellWidth + (columns - 1) * gap + padding * 2;
    const rawHeight = rows * cellWidth + (rows - 1) * gap + padding * 2 + footerHeight;
    const limitedHeight = Math.min(rawHeight, maxHeight);
    const gridMaxHeight = Math.max(
        minCell,
        limitedHeight - footerHeight - padding * 2
    );

    return {
        columns,
        cellWidth,
        gap,
        padding,
        width: Math.min(maxWidth, Math.max(minWidth, gridWidth)),
        height: Math.max(120, limitedHeight),
        gridScrollable: rawHeight > maxHeight,
        gridMaxHeight,
    };
}

function renderChooser(node, detail) {
    const info = ensureWidget(node);
    const layout = determineLayout(node, detail);
    const container = info.container;
    container.innerHTML = "";
    container.style.minHeight = `${layout.height}px`;
    container.style.height = `${layout.height}px`;

    const grid = document.createElement("div");
    grid.className = "cg-chooser-grid";
    grid.style.gridTemplateColumns = `repeat(${layout.columns}, 1fr)`;
    grid.style.gridAutoRows = "auto";
    grid.style.gap = `${layout.gap}px`;
    if (layout.gridScrollable) {
        grid.style.maxHeight = `${layout.gridMaxHeight}px`;
        grid.style.overflowY = "auto";
    } else {
        grid.style.removeProperty("max-height");
        grid.style.overflowY = "hidden";
    }
    info.grid = grid;

    const footer = document.createElement("div");
    footer.className = "cg-chooser-footer";

    const progressBtn = document.createElement("button");
    progressBtn.className = "cg-chooser-progress";
    progressBtn.textContent = "Progress";
    progressBtn.disabled = true;
    progressBtn.addEventListener("click", () => sendSelection(node));
    info.progressBtn = progressBtn;

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cg-chooser-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
        send_cancel();
        clearSelection(node);
    });
    info.cancelBtn = cancelBtn;

    footer.appendChild(cancelBtn);
    footer.appendChild(progressBtn);
    container.appendChild(grid);
    container.appendChild(footer);

    if (info.domWidget) {
        const targetWidth = layout.width;
        const targetHeight = layout.height;
        info.domWidget.computeSize = () => [targetWidth, targetHeight];
        if (typeof node.setSize === "function") {
            node.setSize([targetWidth, targetHeight]);
        } else {
            node.size = [targetWidth, targetHeight];
        }
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
    }

    node._ic_selection = new Set();
    (detail.urls ?? []).forEach((u, idx) => {
        const cell = document.createElement("div");
        cell.className = "cg-chooser-cell";
        cell.dataset.index = String(idx);
        cell.style.aspectRatio = "1 / 1";

        const img = document.createElement("img");
        img.src = api.apiURL(
            `/view?filename=${encodeURIComponent(u.filename)}&type=${u.type}&subfolder=${encodeURIComponent(u.subfolder ?? "")}`
        );
        img.alt = `Image ${idx + 1}`;
        img.addEventListener("load", () => {
            if (img.naturalWidth && img.naturalHeight) {
                cell.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
            }
        });
        cell.appendChild(img);
        cell.addEventListener("click", (event) => {
            event.preventDefault();
            toggleSelection(node, idx);
        });
        grid.appendChild(cell);
    });

    updateButtons(node);
}

function toggleSelection(node, index) {
    const sel = node._ic_selection ?? (node._ic_selection = new Set());
    if (sel.has(index)) sel.delete(index);
    else sel.add(index);
    updateSelections(node);
    if (node._ic_progress_first_pick && sel.size > 0) {
        sendSelection(node);
    }
}

function updateSelections(node) {
    const sel = node._ic_selection ?? new Set();
    const grid = activeWidgets.get(node.id)?.grid;
    if (!grid) return;
    grid.querySelectorAll(".cg-chooser-cell").forEach((cell) => {
        const idx = Number(cell.dataset.index);
        if (sel.has(idx)) cell.classList.add("selected");
        else cell.classList.remove("selected");
    });
    updateButtons(node);
}

function clearSelection(node) {
    node._ic_selection = new Set();
    updateSelections(node);
}

function updateButtons(node) {
    const info = activeWidgets.get(node.id);
    if (!info) return;
    const selSize = node._ic_selection?.size ?? 0;
    if (info.progressBtn) info.progressBtn.disabled = selSize === 0;
}

function sendSelection(node) {
    const target = node._ic_unique_id ?? node.id;
    const sel = Array.from(node._ic_selection ?? []);
    if (sel.length === 0) return;
    sel.sort((a, b) => a - b);
    send_message(target, sel.join(","));
    clearSelection(node);
}

function handleEvent(detail) {
    const node = findNode(detail);
    if (!node) {
        console.warn("Image Chooser Classic: unable to locate node", detail);
        return;
    }
    node._ic_unique_id = detail.unique_id ?? node._ic_unique_id ?? node.id;
    node._ic_display_id = detail.display_id ?? node._ic_display_id ?? node.id;
    node._ic_progress_first_pick = !!detail.progress_first_pick;
    renderChooser(node, detail);
    currentActiveNode = node;
}

function handleKey(event) {
    if (!currentActiveNode) return;
    if (!app.graph?._nodes.includes(currentActiveNode)) {
        currentActiveNode = null;
        return;
    }
    if (!app.ui.settings.getSettingValue("ImageChooser.hotkeys", true)) return;
    const sel = currentActiveNode._ic_selection ?? (currentActiveNode._ic_selection = new Set());
    if (event.key === "0") {
        if (sel.size > 0) sendSelection(currentActiveNode);
        else send_cancel();
        event.preventDefault();
        return;
    }
    const digits = "123456789";
    const idx = digits.indexOf(event.key);
    if (idx >= 0) {
        toggleSelection(currentActiveNode, idx);
        event.preventDefault();
    }
}

function clearWidgetState() {
    activeWidgets.forEach((info, nodeId) => {
        info.grid?.querySelectorAll(".cg-chooser-cell").forEach((cell) => cell.classList.remove("selected"));
        if (info.progressBtn) info.progressBtn.disabled = true;
        const node = app.graph?._nodes_by_id?.[nodeId];
        if (node) node._ic_selection = new Set();
    });
    currentActiveNode = null;
}

app.registerExtension({
    name: "cg.custom.image_chooser.widget",
    init() {
        ensureStyles();
        window.addEventListener("keydown", handleKey, true);
    },
    setup() {
        api.addEventListener(EVENT_NAME, (evt) => {
            handleEvent(evt.detail ?? {});
        });
        api.addEventListener("execution_start", clearWidgetState);
        api.addEventListener("execution_success", clearWidgetState);
        api.addEventListener("execution_error", clearWidgetState);
        api.addEventListener("execution_interrupted", clearWidgetState);
    },
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeType?.comfyClass === "Image Chooser Classic") {
            nodeType.prototype.isImageChooserClassicWidget = true;
            const originalOnAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function (...args) {
                const res = originalOnAdded?.apply(this, args);
                ensureWidget(this);
                return res;
            };
        }
    },
});
