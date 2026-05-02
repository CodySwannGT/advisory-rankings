#!/usr/bin/env node
// Generate an Ed25519 keypair for Harper Fabric pull-deploy from a
// private GitHub repo. See docs/fabric-runbook.md §4.
//
// We use Node's built-in crypto rather than `ssh-keygen` because the
// sandbox we run from doesn't have OpenSSH installed. Output is the
// same OpenSSH formats either tool would produce: a PEM-wrapped
// private key compatible with `ssh -i`, and a single-line public key
// in the `ssh-ed25519 <base64> <comment>` form.
//
// Files written (chmod 600 on the private):
//   /tmp/harper-signup/fabric-deploy-key
//   /tmp/harper-signup/fabric-deploy-key.pub
//
// Override the output dir with --out=PATH or env OUT_DIR.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const argOut = process.argv.find((a) => a.startsWith('--out='));
const OUT_DIR = (argOut && argOut.slice('--out='.length)) || process.env.OUT_DIR || '/tmp/harper-signup';
const COMMENT = process.env.KEY_COMMENT || 'harper-fabric-deploy@advisory-rankings';

fs.mkdirSync(OUT_DIR, { recursive: true });

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

// SubjectPublicKeyInfo (DER) ends with the 32-byte raw pubkey.
const pubDer = publicKey.export({ format: 'der', type: 'spki' });
const rawPub = pubDer.subarray(pubDer.length - 32);
if (rawPub.length !== 32) throw new Error('unexpected pub length');

// Build SSH wire format: 4-byte big-endian length-prefixed strings.
function ssh(parts) {
  const bufs = [];
  for (const p of parts) {
    const b = Buffer.isBuffer(p) ? p : Buffer.from(p, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(b.length);
    bufs.push(len, b);
  }
  return Buffer.concat(bufs);
}

const sshPubBlob = ssh(['ssh-ed25519', rawPub]);
const pubLine = `ssh-ed25519 ${sshPubBlob.toString('base64')} ${COMMENT}\n`;

// PKCS#8 (DER) ends with the 32-byte raw private seed.
const privDer = privateKey.export({ format: 'der', type: 'pkcs8' });
const rawPriv = privDer.subarray(privDer.length - 32);
if (rawPriv.length !== 32) throw new Error('unexpected priv length');

// OpenSSH private key format. Wire: magic + cipher/kdf/kdfopts +
// nkeys + pub-blob (length-prefixed) + priv-section (length-prefixed).
const checkint = crypto.randomBytes(4);
const innerPlaintext = Buffer.concat([
  checkint,
  checkint,
  ssh(['ssh-ed25519', rawPub, Buffer.concat([rawPriv, rawPub])]),
  ssh([COMMENT]),
]);
const padLen = (8 - (innerPlaintext.length % 8)) % 8;
const padding = Buffer.alloc(padLen);
for (let i = 0; i < padLen; i++) padding[i] = i + 1;

const blob = Buffer.concat([
  Buffer.from('openssh-key-v1\0', 'utf8'),
  ssh(['none']), // ciphername
  ssh(['none']), // kdfname
  ssh(['']),     // kdfoptions
  Buffer.from([0, 0, 0, 1]), // nkeys = 1
  ssh([sshPubBlob]),
  ssh([Buffer.concat([innerPlaintext, padding])]),
]);

const b64 = blob.toString('base64').match(/.{1,70}/g).join('\n');
const pem = `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`;

const privPath = path.join(OUT_DIR, 'fabric-deploy-key');
const pubPath = path.join(OUT_DIR, 'fabric-deploy-key.pub');

fs.writeFileSync(privPath, pem, { mode: 0o600 });
fs.writeFileSync(pubPath, pubLine, { mode: 0o644 });

console.log(`wrote ${privPath}  (private, mode 600)`);
console.log(`wrote ${pubPath}   (public)`);
console.log();
console.log('public key line (paste into GitHub Settings → Deploy keys → Add deploy key):');
console.log(pubLine.trimEnd());
console.log();
console.log('private key (paste into Fabric Studio → Config → SSH Keys → Add):');
console.log(`  Name:     advisory-rankings-deploy`);
console.log(`  Key:      <contents of ${privPath}>`);
console.log(`  Host:     advisory-rankings.github.com`);
console.log(`  Hostname: github.com`);
