import { api, refreshMe, logout, search } from "./app.js";
import {
  mountThreeColumnPage,
  EmptyCard,
  SkeletonCard,
  clear,
} from "./design-system/index.js";
import { renderInvestorProofPacket } from "./investor-proof-packet-cards.js";
import type { InvestorProofPacketResponse } from "../harper/resource-investor-proof-packet.js";

const PACKET_RESOURCE = "/InvestorProofPacket";

mountThreeColumnPage({
  active: "investor-proof",
  refreshMe,
  logout,
  search,
  pageTitle: "Investor proof packet",
  build({ center, right }) {
    center.append(SkeletonCard(), SkeletonCard());
    loadPacket(center, right);
  },
});

/**
 * Loads the public investor packet resource.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function loadPacket(center: HTMLElement, right: HTMLElement): void {
  api<InvestorProofPacketResponse>(PACKET_RESOURCE)
    .then(packet => renderInvestorProofPacket(packet, center, right))
    .catch((error: unknown) => renderError(error, center));
}

/**
 * Renders a recoverable load failure state.
 * @param error - Load error.
 * @param center - Main page column.
 */
function renderError(error: unknown, center: HTMLElement): void {
  clear(center);
  center.appendChild(
    EmptyCard({
      title: "Could not load investor proof",
      body: error instanceof Error ? error.message : String(error),
    })
  );
}
