# gill-reproduce-build-create-spl-token-transaction

reproduction for the bug caught when usong the

## Example error:

- Ref: https://explorer.solana.com/tx/HZMXasKmq5iXjuoX6vBbKyd1NoG2Ybd13ZukjmmxGqD6d9wCGfPXHdvGVHcCx1wXzJj947aSTcxzs8XzFswTAmW?cluster=devnet#ix-2
- This bug is only exclusively happening whtn passing in the `TOKEN_PROGRAM_ADDRESS`. Conversely the `TOKEN_2022_PROGRAM_ADDRESS` will work just fine.

## Installation

To install the dependencies for this project, run:

```bash
bun install
```

## Bug Reproduction

To run the bug reproduction:

```bash
bun run ./src/commands/create-spl-token/create-spl-token.failed.with-builder.ts --metadataUri=https://arweave.net/-Omj9t4ligrdhloerV618tHv19unECP_9zi9e3Taqyw --url=https://api.devnet.solana.com --keypair=.keypair/signer.json --name="Sonic SVM Test" --symbol=SONIC_Test
```

## Success Case (Control)

To run the bug reproduction:

```bash
bun run ./src/commands/create-spl-token/create-spl-token.successful.ts --metadataUri=https://arweave.net/-Omj9t4ligrdhloerV618tHv19unECP_9zi9e3Taqyw --url=https://api.devnet.solana.com --keypair=.keypair/signer.json --name="Sonic SVM Test" --symbol=SONIC_Test
```

You may replace the metadata CLI args as you wish.

---

This project was created using `bun init` in bun v1.1.18. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
