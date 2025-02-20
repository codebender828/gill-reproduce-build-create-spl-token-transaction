import { parseArgs } from "util";
import ora, { type Ora } from "ora";
import { createConnection } from "../../utils/connection";
import { createLogger } from "../../utils/logger";
import { assertFileExists, assertKeyInObject } from "../../utils/assert";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  getComputeUnitEstimateForTransactionMessageFactory,
  getSignatureFromTransaction,
  isAddress,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/web3.js";
import { getMinimumBalanceForRentExemption } from "../../utils/accounts/rent";
import { getTransactionPriorityFeeEstimate } from "../../utils/priority-fees";
import {
  getSetComputeUnitPriceInstruction,
  getSetComputeUnitLimitInstruction,
} from "@solana-program/compute-budget";
// import { getCreateAccountInstruction } from "@solana-program/system";

import {
  TOKEN_PROGRAM_ADDRESS,
  getMintSize,
  // getInitializeMintInstruction,
} from "@solana-program/token";

import { createTransactionSenderFactory } from "../../utils/transaction-sender";
import { handleError } from "../../utils/errors";
import { loadKeypairFromFile } from "../../utils/loaders/keypair";

import {
  getCreateAccountInstruction,
  getCreateMetadataAccountV3Instruction,
  getTokenMetadataAddress,
} from "gill/programs";
import {
  buildCreateTokenTransaction,
  getInitializeMintInstruction,
} from "gill/programs/token";

// import {getInitializeMintInstruction}

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    url: {
      type: "string",
    },
    wsUrl: {
      type: "string",
    },
    keypair: {
      type: "string",
    },
    mint: {
      type: "string",
    },
    name: {
      type: "string",
    },
    symbol: {
      type: "string",
    },
    decimals: {
      type: "string",
      default: "9",
    },
    metadataUri: {
      type: "string",
      required: true,
    },
  },
  strict: true,
  allowPositionals: true,
});

const logger = createLogger("create_spl_token");
let spinner: Ora;

export async function createSPLTokenWithGillTransactionBuilder() {
  spinner = ora("Creating SPL Token\n").start();

  assertKeyInObject(values, "metadataUri", "Metadata URI is required.");
  assertKeyInObject(values, "keypair", "Path to keypair is required.");
  assertKeyInObject(values, "name", "Token name is required.");
  assertKeyInObject(values, "symbol", "Token symbol is required.");
  assertKeyInObject(values, "url", "RPC url is required.");

  const { url, wsUrl, metadataUri } = values;
  const websocketsUrl = values.wsUrl || url!.replace("http", "ws");

  logger.info("Using connection URL", url);
  logger.info("Using websockets URL", websocketsUrl, wsUrl ? "" : "(computed)");

  const { rpc } = createConnection(url, websocketsUrl!);

  const pathToKeypair = resolve(values.keypair!);
  assertFileExists(
    pathToKeypair,
    `Unable to locate keypair file at path ${pathToKeypair}. Aborting.`
  );

  if (values.mint) {
    if (!existsSync(values.mint) && !isAddress(values.mint!))
      throw new Error(
        "Invalid mint address provided. Please check the public key string or provide an existing path to the mint address keypair or the public key of the mint address. Aborting..."
      );

    const pathToMintKeypair = resolve(values.mint!);
    assertFileExists(
      pathToMintKeypair,
      `Unable to locate mint address keypair file at path ${pathToMintKeypair}. Aborting.`
    );
  }

  logger.info(
    `Creating SPL token mint ${values.mint} with metadata URI: ${metadataUri}`
  );

  // Signer keypair
  const signer = await loadKeypairFromFile(pathToKeypair);

  // get the latest blockhash
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const decimals = parseInt(values.decimals!);

  const name = values.name!;
  const symbol = values.symbol!;

  const mint = await generateKeyPairSigner();

  const createSPLTokenTransactionPayload = await buildCreateTokenTransaction({
    feePayer: signer,
    latestBlockhash,
    version: 0,
    decimals,
    // Example error:
    // Ref: https://explorer.solana.com/tx/HZMXasKmq5iXjuoX6vBbKyd1NoG2Ybd13ZukjmmxGqD6d9wCGfPXHdvGVHcCx1wXzJj947aSTcxzs8XzFswTAmW?cluster=devnet#ix-2
    // This bug is only exclusively happening whtn passing in the `TOKEN_PROGRAM_ADDRESS`. Conversely the
    // TOKEN_2022_PROGRAM_ADDRESS will work just fine.
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    mint,
    metadata: {
      isMutable: true,
      name,
      uri: metadataUri!,
      symbol,
    },
  });

  // ================================================================================================
  // Here I've removed the compute unit estimate logic because it will fail the simulation step.
  // The goal is ti execute the transaction and get the failed result on-chain.
  // ================================================================================================
  // // Request an estimate of the actual compute units this message will consume.
  // const getComputeUnitEstimateForTransactionMessage =
  //   getComputeUnitEstimateForTransactionMessageFactory({
  //     rpc,
  //   });

  // // Request an estimate of the actual compute units this message will consume.
  // let computeUnitsEstimate = await getComputeUnitEstimateForTransactionMessage(
  //   createSPLTokenTransactionPayload
  // );

  // computeUnitsEstimate =
  //   computeUnitsEstimate < 1000 ? 1000 : Math.ceil(computeUnitsEstimate * 1.2);

  // const priorityFee = await getTransactionPriorityFeeEstimate(rpc);
  // const finalTransactionMessage = appendTransactionMessageInstructions(
  //   [
  //     getSetComputeUnitPriceInstruction({ microLamports: priorityFee }),
  //     getSetComputeUnitLimitInstruction({ units: 60_000 }),
  //   ],
  //   createSPLTokenTransactionPayload
  // );

  const finalSignedTransaction = await signTransactionMessageWithSigners(
    createSPLTokenTransactionPayload
  );

  const sendSignedTransaction = createTransactionSenderFactory(rpc);

  try {
    spinner.text = `Sending and confirming transaction\n`;
    await sendSignedTransaction(finalSignedTransaction, (update) => {
      const signature = getSignatureFromTransaction(finalSignedTransaction);
      // logger.info(update.status, signature);
      spinner.text = `${update.status}:: ${signature}`;
    }).catch((e) => {
      spinner.fail(e.cause);
      logger.error(e.cause);
      logger.error("Error in sending transaction:", e);
    });

    spinner.succeed(`Successfully minted token mint ${mint.address}\n`);
    logger.success(
      "Signature",
      getSignatureFromTransaction(finalSignedTransaction)
    );
  } catch (e) {
    handleError(e, finalSignedTransaction);
    throw e;
  } finally {
    spinner.stop();
  }
}

createSPLTokenWithGillTransactionBuilder()
  .catch((error) => {
    spinner.fail("Failed to create SPL Token.");
    logger.error(error);
  })
  .then(() => {
    logger.success(" Done.");
  });
