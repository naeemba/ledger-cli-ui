// All user-visible strings for the encryption wizard and unlock screen.
// Keep voice consistent with features/auth/authCopy.ts — plain, friendly, no jargon.

export const CRYPTO_COPY = {
  // ── Why-encryption explainer ────────────────────────────────────────────────
  explainer: {
    heading: 'Protect your journal',
    body: [
      'Your financial journal is stored in plain text on this server.',
      'Encrypting it means only you can read it — not the server, not us.',
      'You unlock it with a passphrase you choose; a recovery code lets you in if you forget.',
      'Encryption is optional but strongly recommended if your data is sensitive.',
    ].join(' '),
  },

  // ── Passphrase step ─────────────────────────────────────────────────────────
  passphrase: {
    heading: 'Choose a passphrase',
    label: 'Passphrase',
    helper:
      'Pick something long and memorable — a phrase, not a word. It is never sent to the server.',
    strengthHint:
      'Use at least 4 words or 16 characters. Mix letters and numbers for extra strength.',
    confirmLabel: 'Confirm passphrase',
    confirmHelper:
      'Type the same passphrase again to make sure you got it right.',
    submitLabel: 'Continue',
  },

  // ── Recovery-code step ──────────────────────────────────────────────────────
  recovery: {
    heading: 'Save your recovery code',
    label: 'Recovery code',
    warning:
      'This code is shown once. Write it down or store it in a password manager — you cannot retrieve it later.',
    instruction:
      'If you forget your passphrase, this code is the only way to regain access to your journal.',
    copyLabel: 'Copy code',
    copiedLabel: 'Copied!',
    confirmPrompt: 'I have saved my recovery code',
    saveFirstHint: 'Copy or download your code first.',
    submitLabel: 'Enable encryption',
  },

  // ── Passkey step (optional) ─────────────────────────────────────────────────
  passkey: {
    heading: 'Add a passkey',
    body: 'Optionally let this device unlock your journal with a passkey, alongside your passphrase and recovery code. You can add more later in Settings.',
    twiceNote:
      "You'll be asked to confirm twice — once to create the passkey, once to link it.",
    addLabel: 'Add this device',
    addingLabel: 'Adding…',
    enableLabel: 'Enable unlock',
    enablingLabel: 'Enabling…',
    enrolledLabel: 'Enabled',
    skipLabel: 'Skip for now',
    continueLabel: 'Continue',
    errors: {
      registerFailed: 'Could not create a passkey. Please try again.',
      enrollFailed: 'Could not link the passkey. Please try again.',
      cancelled: 'Passkey prompt was dismissed or timed out.',
    },
  },

  // ── Encrypting / progress step ──────────────────────────────────────────────
  encrypting: {
    heading: 'Encrypting your journal…',
    body: 'This may take a moment. Do not close this page.',
  },

  // ── Unlock screen ───────────────────────────────────────────────────────────
  unlock: {
    heading: 'Your journal is locked',
    subheading: 'Enter your passphrase or recovery code to continue.',
    passphrasePlaceholder: 'Passphrase',
    recoveryPlaceholder: 'Recovery code  (e.g. ABCD-EFGH-…)',
    submitLabel: 'Unlock',
    unlockingLabel: 'Unlocking…',
    switchToRecovery: 'Use recovery code instead',
    switchToPassphrase: 'Use passphrase instead',
  },

  // ── Error messages ──────────────────────────────────────────────────────────
  errors: {
    incorrectPassphrase: 'Incorrect passphrase.',
    incorrectRecovery: 'Incorrect recovery code.',
    notSetUp: 'Encryption is not set up.',
    unlockFailed: 'Unlock failed. Please try again.',
    setupFailed: 'Encryption setup failed. Please try again.',
    generic: 'Something went wrong. Please try again.',
  },
} as const;

export type CryptoCopy = typeof CRYPTO_COPY;
