export class AttachmentCrypto {
    static async encrypt(plaintextBuffer) {
        const ivArray = new Uint8Array(16);
        crypto.getRandomValues(ivArray.subarray(0, 8));
        const cryptoKey = await crypto.subtle.generateKey(
            { "name": "AES-CTR", "length": 256 }, true, ["encrypt", "decrypt"],
        );
        const exportedKey = await crypto.subtle.exportKey("jwk", cryptoKey);
        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: "AES-CTR", counter: ivArray, length: 64 }, cryptoKey, plaintextBuffer,
        );
        const sha256Buffer = await crypto.subtle.digest("SHA-256", ciphertextBuffer);
        return {
            data: ciphertextBuffer,
            info: {
                v: "v2",
                key: exportedKey,
                iv: AttachmentCrypto.encodeBase64(ivArray),
                hashes: {
                    sha256: AttachmentCrypto.encodeBase64(new Uint8Array(sha256Buffer)),
                },
            },
        };
    }

    static async decrypt(ciphertextBuffer, info) {
        if (info === undefined || info.key === undefined || info.iv === undefined
            || info.hashes === undefined || info.hashes.sha256 === undefined) {
            throw new Error("Invalid info. Missing info.key, info.iv or info.hashes.sha256 key");
        }

        if (info.v && !info.v.match(/^v[1-2]$/)) {
            throw new Error(`Unsupported protocol version: ${info.v}`);
        }

        const ivArray = AttachmentCrypto.decodeBase64(info.iv);
        const expectedSha256base64 = info.hashes.sha256;
        const cryptoKey = await crypto.subtle.importKey(
            "jwk", info.key, { "name": "AES-CTR" }, false, ["encrypt", "decrypt"],
        );
        const digestResult = await crypto.subtle.digest("SHA-256", ciphertextBuffer);
        if (AttachmentCrypto.encodeBase64(new Uint8Array(digestResult)) != expectedSha256base64) {
            throw new Error("Mismatched SHA-256 digest");
        }
        let counterLength;
        if (info.v == "v1" || info.v == "v2") {
            counterLength = 64;
        } else {
            counterLength = 128;
        }
        return crypto.subtle.decrypt(
            { name: "AES-CTR", counter: ivArray, length: counterLength }, cryptoKey, ciphertextBuffer,
        );
    }

    static encodeBase64(uint8Array) {
        const latin1String = String.fromCharCode.apply(null, uint8Array);
        const paddedBase64 = btoa(latin1String);
        const inputLength = uint8Array.length;
        const outputLength = 4 * Math.floor((inputLength + 2) / 3) + (inputLength + 2) % 3 - 2;
        return paddedBase64.slice(0, outputLength);
    }

    static decodeBase64(base64) {
        const paddedBase64 = base64 + "===".slice(0, (4 - base64.length % 4) % 4);
        const latin1String = atob(paddedBase64);
        const uint8Array = new Uint8Array(latin1String.length);
        for (let i = 0; i < latin1String.length; i++) {
            uint8Array[i] = latin1String.charCodeAt(i);
        }
        return uint8Array;
    }
}
