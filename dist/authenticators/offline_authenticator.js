"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authChannelWithKey = exports.signToken = exports.importSigningKey = void 0;
/**
 * Signs join tokens in the browser, for local experiments only: the private key is in the page,
 * so anyone can read it. In production, tokens come from the app's backend (HttpAuthenticator).
 *
 * A token is a JWT signed with EdDSA (Ed25519): `header.payload.signature`, each part base64url,
 * the same as any JWT library makes with `alg: "EdDSA"`.
 */
function base64UrlEncode(bytes) {
    var binary = '';
    bytes.forEach(function (byte) { return binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToBytes(pem) {
    var base64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
/** Imports a PKCS#8 PEM private key, as printed by `pikoman_admin gen-app`. */
function importSigningKey(privateKeyPem) {
    return crypto.subtle.importKey('pkcs8', pemToBytes(privateKeyPem), { name: 'Ed25519' }, false, ['sign']);
}
exports.importSigningKey = importSigningKey;
var encodeJson = function (value) { return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value))); };
function signToken(payload, signingKey) {
    return __awaiter(this, void 0, void 0, function () {
        var signed, signature;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    signed = encodeJson({ alg: 'EdDSA', typ: 'JWT' }) + "." + encodeJson(payload);
                    return [4 /*yield*/, crypto.subtle.sign({ name: 'Ed25519' }, signingKey, new TextEncoder().encode(signed))];
                case 1:
                    signature = _a.sent();
                    return [2 /*return*/, signed + "." + base64UrlEncode(new Uint8Array(signature))];
            }
        });
    });
}
exports.signToken = signToken;
function authChannelWithKey(clientId, channelName, data, signingKey, permissions, lifetimeSeconds) {
    if (permissions === void 0) { permissions = 0; }
    if (lifetimeSeconds === void 0) { lifetimeSeconds = 300; }
    return signToken({
        connection: clientId,
        channel: channelName,
        access: permissions,
        data: data,
        exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    }, signingKey);
}
exports.authChannelWithKey = authChannelWithKey;
var OfflineAuthenticator = /** @class */ (function () {
    /** `privateKey` is a PKCS#8 PEM string or an imported Ed25519 CryptoKey. */
    function OfflineAuthenticator(data, privateKey, permissions) {
        this.data = data;
        this.signingKey = typeof privateKey === 'string' ? importSigningKey(privateKey) : Promise.resolve(privateKey);
        this.permissions = permissions;
    }
    OfflineAuthenticator.prototype.authenticate = function (clientId, channelName, _options) {
        if (_options === void 0) { _options = {}; }
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = authChannelWithKey;
                        _b = [clientId, channelName, this.data];
                        return [4 /*yield*/, this.signingKey];
                    case 1: return [2 /*return*/, _a.apply(void 0, _b.concat([_c.sent(), this.permissions]))];
                }
            });
        });
    };
    return OfflineAuthenticator;
}());
exports.default = OfflineAuthenticator;
