import { contextStatusText } from "../adapters/pi-smart-compact/index.ts";
import { createStatusRowRenderer } from "./status-row.ts";

/** Renders `pi-smart-compact.context-usage` messages as a status row. */
export const renderContextStatus = createStatusRowRenderer("Context usage", contextStatusText);
