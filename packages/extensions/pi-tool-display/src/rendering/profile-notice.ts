import { profileNoticeText } from "../adapters/pi-profiles/index.ts";
import { createStatusRowRenderer } from "./status-row.ts";

/** Renders `pi-profiles.notice` messages as a status row. */
export const renderProfileNotice = createStatusRowRenderer("Profile", profileNoticeText);
