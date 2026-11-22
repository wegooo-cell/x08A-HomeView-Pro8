# NetEase WEAPI protocol references

Paths, fields and public RSA key checked on 2026-10-23 against the API module maintainer's primary source:
- https://github.com/neteasecloudmusicapienhanced/api-enhanced/blob/main/module/recommend_resource.js
- https://github.com/neteasecloudmusicapienhanced/api-enhanced/blob/main/module/recommend_songs.js
- https://github.com/neteasecloudmusicapienhanced/api-enhanced/blob/main/module/cloudsearch.js
- https://github.com/neteasecloudmusicapienhanced/api-enhanced/blob/main/util/crypto.js

NetEaseProtocol.java is implemented here with standard JCA AES-CBC/PKCS5 and RSA raw public encryption. No upstream JavaScript dependency, account or private key is bundled. The public protocol key is not a user's credential. These are unofficial music-service endpoints and may change; client errors must remain visible, never replaced by fabricated recommendations.
