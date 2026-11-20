import {
  AnchorProvider,
  Program,
  type Idl,
  type Wallet
} from "@coral-xyz/anchor";

import {
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram
} from "@solana/web3.js";

import { Buffer } from "buffer";
import aeroChainIdl from "../idl/aerochain.json";

(globalThis as typeof globalThis & {
  Buffer: typeof Buffer;
}).Buffer = Buffer;

const PROGRAM_ID = "E3Ai1odomZQjyXAbvy1bRpXuvXATELeYKZ7HVsShvg2C";
const NETWORK = "devnet";

const connection = new Connection(
  clusterApiUrl(NETWORK),
  "confirmed"
);

const connectButton = document.getElementById(
  "connectWallet"
) as HTMLButtonElement | null;

const balanceElement = document.getElementById("walletBalance");
const statusElement = document.getElementById("walletStatus");

const createFlightForm = document.getElementById(
  "createFlightForm"
) as HTMLFormElement | null;

const createFlightButton = document.getElementById(
  "createFlightButton"
) as HTMLButtonElement | null;

const flightMessage = document.getElementById("flightMessage");

const flightsList = document.getElementById("flightsList");

const refreshFlightsButton = document.getElementById(
  "refreshFlights"
) as HTMLButtonElement | null;

let provider: AnchorProvider | null = null;
let program: Program<Idl> | null = null;
let walletPublicKey: PublicKey | null = null;

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: Wallet["signTransaction"];
  signAllTransactions: Wallet["signAllTransactions"];
  on?: (event: string, callback: () => void) => void;
}

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
    solana?: PhantomProvider;
  }
}

function setFlightMessage(
  message: string,
  isError = false
): void {
  if (!flightMessage) return;

  flightMessage.textContent = message;
  flightMessage.style.color = isError
    ? "#ff7373"
    : "#35dc9a";
}

async function updateWalletBalance(): Promise<void> {
  if (!walletPublicKey || !balanceElement) return;

  const balance = await connection.getBalance(walletPublicKey);

  balanceElement.textContent =
    `${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
}

async function loadFlights(): Promise<void> {
  if (!program || !flightsList) return;

  flightsList.textContent = "Loading flights from Solana Devnet...";

  try {
    // The IDL is loaded dynamically, so we use the runtime account namespace.
    const activeProgram = program as Program<any>;

    const flights = await (activeProgram.account as any).flight.all();

    flightsList.replaceChildren();

    if (flights.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const heading = document.createElement("h3");
      heading.textContent = "No flights registered yet";

      const description = document.createElement("p");
      description.textContent =
        "Create the first flight using the form above.";

      empty.append(heading, description);
      flightsList.appendChild(empty);
      return;
    }

    for (const item of flights) {
      const flight = item.account;

      const card = document.createElement("article");
      card.className = "flight-card";

      const heading = document.createElement("h4");
      heading.textContent = `Flight ${flight.flightNumber}`;

      const route = document.createElement("p");
      route.textContent =
        `${flight.origin} → ${flight.destination}`;

      const owner = document.createElement("p");
      owner.textContent =
        `Owner: ${flight.owner.toBase58()}`;

      const seats = document.createElement("p");
      seats.textContent =
        `Occupied seats: ${flight.occupiedSeats.length} / 9`;

      const reservations = document.createElement("p");
      reservations.textContent =
        `Reservations created: ${flight.reservationCounter}`;

      const address = document.createElement("p");
      address.textContent =
        `PDA: ${item.publicKey.toBase58()}`;

      card.append(
        heading,
        route,
        owner,
        seats,
        reservations,
        address
      );

      flightsList.appendChild(card);
    }

    console.log("Flights loaded:", flights.length);

  } catch (error) {
    console.error("Unable to load flights:", error);

    flightsList.textContent =
      "Unable to retrieve flights. Check the browser console.";
  }
}

async function connectWallet(): Promise<void> {
  try {
    const wallet = window.phantom?.solana ?? window.solana;

    if (!wallet?.isPhantom) {
      alert("Please install Phantom Wallet first.");
      window.open("https://phantom.com/", "_blank");
      return;
    }

    if (
      typeof wallet.signTransaction !== "function" ||
      typeof wallet.signAllTransactions !== "function"
    ) {
      throw new Error("Phantom signing methods are unavailable.");
    }

    const response = await wallet.connect();
    const connectedPublicKey = response.publicKey;

    walletPublicKey = connectedPublicKey;

    const anchorWallet = wallet as unknown as Wallet;

    provider = new AnchorProvider(
      connection,
      anchorWallet,
      AnchorProvider.defaultOptions()
    );

    if (aeroChainIdl.address !== PROGRAM_ID) {
      throw new Error(
        "IDL program address does not match AeroChain."
      );
    }

    program = new Program(
      aeroChainIdl as Idl,
      provider
    );

    await updateWalletBalance();

    if (statusElement) {
      statusElement.textContent =
        `${connectedPublicKey.toBase58().slice(0, 8)}...`;
    }

    if (connectButton) {
      connectButton.textContent =
        `${connectedPublicKey.toBase58().slice(0, 4)}...` +
        `${connectedPublicKey.toBase58().slice(-4)}`;
    }

    if (createFlightButton) {
      createFlightButton.disabled = false;
      createFlightButton.textContent = "Create Flight on Devnet";
    }

    console.log("Wallet connected:", connectedPublicKey.toBase58());
    console.log("Network:", NETWORK);
    console.log("AeroChain program:", program.programId.toBase58());
    console.log("Anchor provider initialized:", !!provider);

    await loadFlights();

  } catch (error) {
    console.error("AeroChain connection error:", error);

    const message =
      error instanceof Error ? error.message : String(error);

    alert("Unable to initialize AeroChain: " + message);
  }
}

async function createFlight(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!program || !provider || !walletPublicKey) {
    setFlightMessage("Connect Phantom Wallet before creating a flight.", true);
    return;
  }

  const flightNumberInput = document.getElementById(
    "flightNumber"
  ) as HTMLInputElement | null;

  const originInput = document.getElementById(
    "flightOrigin"
  ) as HTMLInputElement | null;

  const destinationInput = document.getElementById(
    "flightDestination"
  ) as HTMLInputElement | null;

  const flightNumber = flightNumberInput?.value.trim() ?? "";
  const origin = originInput?.value.trim() ?? "";
  const destination = destinationInput?.value.trim() ?? "";

  if (
    !flightNumber ||
    flightNumber.length > 10 ||
    !origin ||
    origin.length > 30 ||
    !destination ||
    destination.length > 30
  ) {
    setFlightMessage(
      "Check the fields: flight number max 10 characters; origin and destination max 30.",
      true
    );
    return;
  }

  if (origin === destination) {
    setFlightMessage(
      "Origin and destination must be different.",
      true
    );
    return;
  }

  if (createFlightButton) {
    createFlightButton.disabled = true;
    createFlightButton.textContent = "Waiting for Phantom...";
  }

  try {
    const activeProgram = program as Program<any>;

    const [flightPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("flight"),
        Buffer.from(flightNumber, "utf8"),
        walletPublicKey.toBuffer()
      ],
      activeProgram.programId
    );

    setFlightMessage("Please approve the transaction in Phantom.");

    const signature = await (activeProgram.methods as any)
      .createFlight(flightNumber, origin, destination)
      .accounts({
        owner: walletPublicKey,
        flight: flightPda,
        systemProgram: SystemProgram.programId
      })
      .rpc();

    setFlightMessage(
      `Flight created successfully! Transaction: ${signature}`
    );

    console.log("Flight PDA:", flightPda.toBase58());
    console.log("Transaction signature:", signature);

    createFlightForm?.reset();

    await updateWalletBalance();
    await loadFlights();

  } catch (error) {
    console.error("Create flight error:", error);

    const message =
      error instanceof Error ? error.message : String(error);

    setFlightMessage(`Transaction failed: ${message}`, true);

  } finally {
    if (createFlightButton) {
      createFlightButton.disabled = !walletPublicKey;
      createFlightButton.textContent = "Create Flight on Devnet";
    }
  }
}

connectButton?.addEventListener("click", connectWallet);

createFlightForm?.addEventListener("submit", createFlight);

refreshFlightsButton?.addEventListener("click", loadFlights);

const phantom = window.phantom?.solana ?? window.solana;

phantom?.on?.("disconnect", () => {
  walletPublicKey = null;
  provider = null;
  program = null;

  if (balanceElement) {
    balanceElement.textContent = "-- SOL";
  }

  if (statusElement) {
    statusElement.textContent = "Wallet disconnected";
  }

  if (connectButton) {
    connectButton.textContent = "Connect Wallet";
  }

  if (createFlightButton) {
    createFlightButton.disabled = true;
    createFlightButton.textContent = "Connect Wallet to Create Flight";
  }

  if (flightsList) {
    flightsList.textContent = "Connect your wallet to load flights.";
  }

  setFlightMessage("Wallet disconnected.");
});

console.log("AeroChain TypeScript frontend initialized.");
console.log("Solana network:", NETWORK);
