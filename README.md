# Ledger CLI NextJS Reporting Tool

This project is based on [ledger-cli](https://ledger-cli.org/).

## Setup the Project

Currently, there is no online usage for this project.

For you to run it locally, you can check out the project and run `pnpm install`.

Then you need to create the `.env` file in the root of project. You can use the sample `.env` file with the name `.env.example` and duplicate it.

Current variables are:

```

DEFAULT_CURRENCY=USD
LEDGER_FILE=~/journals/ledger.ledger
LEDGER_PRICE_DB=~/journals/price-db.ledger
DATE_LOCALE=en-US

```

## Start the project

You need to have ledger-cli on your system. After installint the dependencies and adding the `.env` file. you can simply use `next dev` to start the project.

You can see the result on the chrome browser: `http://localhost:3000`
