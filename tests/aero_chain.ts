// Anchor/Mocha acceptance-test skeleton.
// Replace the generated IDL import and helper setup after `anchor build`.
import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

describe("aero_chain acceptance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("documents the nine-passenger capacity invariant", async () => {
    // TODO: create one flight and book nine seats using nine distinct Keypairs.
    // TODO: assert Flight.activeBookings === 9.
    // TODO: assert a tenth booking rejects with FlightFull.
    expect(9).to.equal(9); // Placeholder; replace with on-chain assertions.
  });
});
