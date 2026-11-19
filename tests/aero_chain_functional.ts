import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { readFileSync } from "node:fs";

const idl = JSON.parse(
  readFileSync("target/idl/aerochain.json", "utf8")
);

describe("AeroChain - Functional tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program: any = new anchor.Program(idl, provider);
  const owner = provider.wallet.publicKey;

  let flightSequence = 0;

  async function fundWallet(publicKey: anchor.web3.PublicKey) {
    const signature = await provider.connection.requestAirdrop(
      publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );

    const latestBlockhash =
      await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction(
      { signature, ...latestBlockhash },
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

  async function createTestFlight() {
    const flightNumber =
      `AC${Date.now().toString().slice(-7)}${flightSequence++}`;

    const flight = deriveFlightPda(flightNumber);

    await program.methods
      .createFlight(flightNumber, "MEX", "CUN")
      .accounts({
        owner,
        flight,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return flight;
  }

  async function reserve(
    flight: anchor.web3.PublicKey,
    passenger: anchor.web3.Keypair,
    reservationId: number,
    seat: string
  ) {
    const reservation = deriveReservationPda(
      flight,
      reservationId
    );

    await program.methods
      .reserveSeat(`Passenger ${reservationId + 1}`, seat)
      .accounts({
        passenger: passenger.publicKey,
        flight,
        reservation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([passenger])
      .rpc();

    return reservation;
  }

  async function expectProgramError(
    action: () => Promise<any>,
    expectedCode: string
  ) {
    let rejected = false;

    try {
      await action();
    } catch (error: any) {
      rejected = true;
      const errorCode = error.error?.errorCode?.code;
      expect(errorCode).to.equal(expectedCode);
    }

    expect(rejected).to.equal(true);
  }

  it("rejects duplicate seat reservations", async () => {
    const flight = await createTestFlight();

    const passenger1 = anchor.web3.Keypair.generate();
    const passenger2 = anchor.web3.Keypair.generate();

    await fundWallet(passenger1.publicKey);
    await fundWallet(passenger2.publicKey);

    await reserve(flight, passenger1, 0, "1");

    await expectProgramError(
      () => reserve(flight, passenger2, 1, "1"),
      "SeatOccupied"
    );

    const flightAccount = await program.account.flight.fetch(flight);

    expect(flightAccount.reservations.length).to.equal(1);
    expect(flightAccount.occupiedSeats).to.deep.equal(["1"]);
    expect(Number(flightAccount.reservationCounter)).to.equal(1);
  });

  it("allows changing to an available seat and rejects invalid changes", async () => {
    const flight = await createTestFlight();

    const passenger1 = anchor.web3.Keypair.generate();
    const passenger2 = anchor.web3.Keypair.generate();

    await fundWallet(passenger1.publicKey);
    await fundWallet(passenger2.publicKey);

    const reservation1 = await reserve(flight, passenger1, 0, "1");
    await reserve(flight, passenger2, 1, "2");

    // Reject changing to the same seat.
    await expectProgramError(
      () =>
        program.methods
          .changeSeat(0, "1")
          .accounts({
            passenger: passenger1.publicKey,
            flight,
            reservation: reservation1,
          })
          .signers([passenger1])
          .rpc(),
      "SeatSame"
    );

    // Reject changing to an occupied seat.
    await expectProgramError(
      () =>
        program.methods
          .changeSeat(0, "2")
          .accounts({
            passenger: passenger1.publicKey,
            flight,
            reservation: reservation1,
          })
          .signers([passenger1])
          .rpc(),
      "SeatOccupied"
    );

    // Change to an available seat.
    await program.methods
      .changeSeat(0, "3")
      .accounts({
        passenger: passenger1.publicKey,
        flight,
        reservation: reservation1,
      })
      .signers([passenger1])
      .rpc();

    const updatedReservation =
      await program.account.reservation.fetch(reservation1);

    const flightAccount = await program.account.flight.fetch(flight);

    expect(updatedReservation.seat).to.equal("3");
    expect(flightAccount.occupiedSeats).to.deep.equal(["3", "2"]);
  });

  it("allows cancellation and makes the released seat available again", async () => {
    const flight = await createTestFlight();

    const passenger1 = anchor.web3.Keypair.generate();
    const passenger2 = anchor.web3.Keypair.generate();

    await fundWallet(passenger1.publicKey);
    await fundWallet(passenger2.publicKey);

    const reservation0 = await reserve(
      flight,
      passenger1,
      0,
      "1"
    );

    // Cancel the passenger's own reservation.
    await program.methods
      .cancelReservation(0)
      .accounts({
        passenger: passenger1.publicKey,
        flight,
        reservation: reservation0,
      })
      .signers([passenger1])
      .rpc();

    // The reservation account should be closed.
    const closedAccount =
      await provider.connection.getAccountInfo(reservation0);

    expect(closedAccount).to.equal(null);

    // The next passenger can reserve the released seat.
    await reserve(flight, passenger2, 1, "1");

    const flightAccount = await program.account.flight.fetch(flight);

    expect(flightAccount.reservations.length).to.equal(1);
    expect(flightAccount.occupiedSeats).to.deep.equal(["1"]);
    expect(Number(flightAccount.reservationCounter)).to.equal(2);
  });

  it("prevents another passenger from changing a reservation", async () => {
    const flight = await createTestFlight();

    const passenger = anchor.web3.Keypair.generate();
    const attacker = anchor.web3.Keypair.generate();

    await fundWallet(passenger.publicKey);
    await fundWallet(attacker.publicKey);

    const reservation = await reserve(flight, passenger, 0, "1");

    await expectProgramError(
      () =>
        program.methods
          .changeSeat(0, "3")
          .accounts({
            passenger: attacker.publicKey,
            flight,
            reservation,
          })
          .signers([attacker])
          .rpc(),
      "ConstraintHasOne"
    );

    const reservationAccount =
      await program.account.reservation.fetch(reservation);

    expect(reservationAccount.seat).to.equal("1");
  });

  it("prevents another passenger from cancelling a reservation", async () => {
    const flight = await createTestFlight();

    const passenger = anchor.web3.Keypair.generate();
    const attacker = anchor.web3.Keypair.generate();

    await fundWallet(passenger.publicKey);
    await fundWallet(attacker.publicKey);

    const reservation = await reserve(flight, passenger, 0, "1");

    await expectProgramError(
      () =>
        program.methods
          .cancelReservation(0)
          .accounts({
            passenger: attacker.publicKey,
            flight,
            reservation,
          })
          .signers([attacker])
          .rpc(),
      "ConstraintHasOne"
    );

    // The original reservation must still exist.
    const reservationAccount =
      await program.account.reservation.fetch(reservation);

    expect(reservationAccount.seat).to.equal("1");

    const flightAccount = await program.account.flight.fetch(flight);

    expect(flightAccount.reservations.length).to.equal(1);
    expect(flightAccount.occupiedSeats).to.deep.equal(["1"]);
  });
});

describe("AeroChain - Boundary and edge-case tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program: any = new anchor.Program(idl, provider);
  const owner = provider.wallet.publicKey;
  let flightSequence = 100;

  async function fundWallet(publicKey: anchor.web3.PublicKey) {
    const signature = await provider.connection.requestAirdrop(
      publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction(
      { signature, ...latestBlockhash },
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
      [Buffer.from("reservation"), flight.toBuffer(), idBuffer],
      program.programId
    )[0];
  }

  function nextFlightNumber() {
    return `A${Date.now().toString().slice(-8)}${flightSequence++ % 10}`;
  }

  async function createFlightWithData(
    flightNumber: string,
    origin: string,
    destination: string
  ) {
    const flight = deriveFlightPda(flightNumber);

    await program.methods
      .createFlight(flightNumber, origin, destination)
      .accounts({
        owner,
        flight,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return flight;
  }

  async function expectProgramError(
    action: () => Promise<any>,
    expectedCode: string
  ) {
    let rejected = false;

    try {
      await action();
    } catch (error: any) {
      rejected = true;
      expect(error.error?.errorCode?.code).to.equal(expectedCode);
    }

    expect(rejected).to.equal(true);
  }

  it("rejects empty passenger names and names longer than 30 characters", async () => {
    const flight = await createFlightWithData(nextFlightNumber(), "MEX", "CUN");
    const passenger = anchor.web3.Keypair.generate();
    await fundWallet(passenger.publicKey);

    const reservation = deriveReservationPda(flight, 0);

    for (const invalidName of ["", "P".repeat(31)]) {
      await expectProgramError(
        () =>
          program.methods
            .reserveSeat(invalidName, "1")
            .accounts({
              passenger: passenger.publicKey,
              flight,
              reservation,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([passenger])
            .rpc(),
        "InvalidPassengerName"
      );
    }

    const flightAccount = await program.account.flight.fetch(flight);
    expect(flightAccount.reservations.length).to.equal(0);
    expect(Number(flightAccount.reservationCounter)).to.equal(0);
  });

  it("rejects empty seats and seats longer than 3 characters", async () => {
    const flight = await createFlightWithData(nextFlightNumber(), "MEX", "CUN");
    const passenger = anchor.web3.Keypair.generate();
    await fundWallet(passenger.publicKey);

    const reservation = deriveReservationPda(flight, 0);

    for (const invalidSeat of ["", "1234"]) {
      await expectProgramError(
        () =>
          program.methods
            .reserveSeat("Passenger Test", invalidSeat)
            .accounts({
              passenger: passenger.publicKey,
              flight,
              reservation,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([passenger])
            .rpc(),
        "InvalidSeat"
      );
    }

    const flightAccount = await program.account.flight.fetch(flight);
    expect(flightAccount.reservations.length).to.equal(0);
    expect(Number(flightAccount.reservationCounter)).to.equal(0);
  });

  it("accepts values at the maximum allowed field lengths", async () => {
    const flightNumber = `A${Date.now().toString().slice(-9)}`.slice(0, 10);
    const origin = "O".repeat(30);
    const destination = "D".repeat(30);

    const flight = await createFlightWithData(
      flightNumber,
      origin,
      destination
    );

    const passenger = anchor.web3.Keypair.generate();
    await fundWallet(passenger.publicKey);

    const reservation = deriveReservationPda(flight, 0);

    await program.methods
      .reserveSeat("P".repeat(30), "123")
      .accounts({
        passenger: passenger.publicKey,
        flight,
        reservation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([passenger])
      .rpc();

    const flightAccount = await program.account.flight.fetch(flight);
    const reservationAccount =
      await program.account.reservation.fetch(reservation);

    expect(flightAccount.flightNumber).to.equal(flightNumber);
    expect(flightAccount.origin).to.equal(origin);
    expect(flightAccount.destination).to.equal(destination);
    expect(reservationAccount.passengerName).to.equal("P".repeat(30));
    expect(reservationAccount.seat).to.equal("123");
  });

  it("rejects flight numbers, origins and destinations outside their limits", async () => {
    await expectProgramError(
      () =>
        createFlightWithData("F".repeat(11), "MEX", "CUN"),
      "InvalidFlightNumber"
    );

    await expectProgramError(
      () =>
        createFlightWithData(nextFlightNumber(), "", "CUN"),
      "InvalidOrigin"
    );

    await expectProgramError(
      () =>
        createFlightWithData(nextFlightNumber(), "MEX", "D".repeat(31)),
      "InvalidDestination"
    );
  });

  it("allows changing a seat when the flight is full", async () => {
    const flightNumber = nextFlightNumber();
    const flight = await createFlightWithData(flightNumber, "MEX", "CUN");

    const passengers = Array.from(
      { length: 9 },
      () => anchor.web3.Keypair.generate()
    );

    for (const passenger of passengers) {
      await fundWallet(passenger.publicKey);
    }

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

    const firstReservation = deriveReservationPda(flight, 0);

    await program.methods
      .changeSeat(0, "10")
      .accounts({
        passenger: passengers[0].publicKey,
        flight,
        reservation: firstReservation,
      })
      .signers([passengers[0]])
      .rpc();

    const reservationAccount =
      await program.account.reservation.fetch(firstReservation);
    const flightAccount = await program.account.flight.fetch(flight);

    expect(reservationAccount.seat).to.equal("10");
    expect(flightAccount.reservations.length).to.equal(9);
    expect(flightAccount.occupiedSeats.length).to.equal(9);
    expect(flightAccount.occupiedSeats).to.include("10");
    expect(flightAccount.occupiedSeats).not.to.include("1");
  });
});
