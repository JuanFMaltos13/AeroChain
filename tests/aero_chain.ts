import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { readFileSync } from "node:fs";

const idl = JSON.parse(readFileSync("target/idl/aerochain.json", "utf8"));

describe("AeroChain - Capacity acceptance test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program: any = new anchor.Program(idl, provider);
  const owner = provider.wallet.publicKey;

  async function fundWallet(publicKey: anchor.web3.PublicKey) {
    const signature = await provider.connection.requestAirdrop(
      publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );

    const latestBlockhash =
      await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash,
      },
      "confirmed"
    );
  }

  function deriveFlightPda(flightNumber: string) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("flight"),
        Buffer.from(flightNumber),
        owner.toBuffer(),
      ],
      program.programId
    )[0];
  }

  function deriveReservationPda(
    flight: anchor.web3.PublicKey,
    reservationId: number
  ) {
    const idBuffer = Buffer.alloc(2);
    idBuffer.writeUInt16LE(reservationId);

    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("reservation"),
        flight.toBuffer(),
        idBuffer,
      ],
      program.programId
    )[0];
  }

  it("allows nine reservations and rejects the tenth", async () => {
    // 1. Create a unique flight.
    const flightNumber = `AC${Date.now().toString().slice(-8)}`;
    const flight = deriveFlightPda(flightNumber);

    await program.methods
      .createFlight(flightNumber, "MEX", "CUN")
      .accounts({
        owner,
        flight,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // 2. Generate and fund nine independent passenger wallets.
    const passengers = Array.from(
      { length: 9 },
      () => anchor.web3.Keypair.generate()
    );

    for (const passenger of passengers) {
      await fundWallet(passenger.publicKey);
    }

    // 3. Reserve seats 1 through 9.
    for (let i = 0; i < passengers.length; i++) {
      const reservation = deriveReservationPda(flight, i);

      await program.methods
        .reserveSeat(`Passenger ${i + 1}`, String(i + 1))
        .accounts({
          passenger: passengers[i].publicKey,
          flight,
          reservation,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([passengers[i]])
        .rpc();
    }

    // 4. Verify that the flight has exactly nine reservations.
    let flightAccount = await program.account.flight.fetch(flight);

    expect(flightAccount.reservations.length).to.equal(9);
    expect(flightAccount.occupiedSeats.length).to.equal(9);
    expect(Number(flightAccount.reservationCounter)).to.equal(9);

    // 5. Fund a tenth passenger and attempt another reservation.
    const tenthPassenger = anchor.web3.Keypair.generate();
    await fundWallet(tenthPassenger.publicKey);

    const tenthReservation = deriveReservationPda(flight, 9);
    let rejected = false;

    try {
      await program.methods
        .reserveSeat("Passenger 10", "10")
        .accounts({
          passenger: tenthPassenger.publicKey,
          flight,
          reservation: tenthReservation,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([tenthPassenger])
        .rpc();
    } catch (error: any) {
      rejected = true;

      const errorCode = error.error?.errorCode?.code;
      expect(errorCode).to.equal("FlightFull");
    }

    expect(rejected).to.equal(true);

    // 6. Verify that the failed transaction changed nothing.
    flightAccount = await program.account.flight.fetch(flight);

    expect(flightAccount.reservations.length).to.equal(9);
    expect(flightAccount.occupiedSeats.length).to.equal(9);
    expect(Number(flightAccount.reservationCounter)).to.equal(9);

    console.log("Capacity test passed: 9 reservations, 10th rejected.");
  });
});
