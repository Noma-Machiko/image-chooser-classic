import { api } from "../../scripts/api.js";

function send_message(id, message) {
    const body = new FormData();
    body.append("id", id ?? "");
    body.append("message", message);
    return api.fetchApi("/image_chooser_classic_message", { method: "POST", body });
}

function send_cancel(id = -1) {
    return send_message(id, "__cancel__");
}

let skip_next = 0;
function skip_next_restart_message() {
    skip_next += 1;
}

function send_onstart() {
    if (skip_next > 0) {
        skip_next -= 1;
        return false;
    }
    send_message(-1, "__start__");
    return true;
}

export { send_message, send_cancel, send_onstart, skip_next_restart_message };
