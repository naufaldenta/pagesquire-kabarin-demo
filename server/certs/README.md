# Supabase PostgreSQL CA

`supabase-prod-ca-2021.crt` is the public **Supabase Root 2021 CA** certificate,
downloaded over verified HTTPS from Supabase's certificate distribution endpoint:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 fingerprint:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

Expires April 26, 2031. Retrieved October 24, 2026. It contains no private key or
project credentials. Only the PostgreSQL TLS client for the official
`*.pooler.supabase.com` hostname uses this CA. Certificate-chain and hostname
verification remain enabled. No global trust store or Supabase SSL setting is changed.

Official guidance: https://supabase.com/docs/guides/platform/ssl-enforcement

When Supabase rotates the issuing CA, review the replacement from its official
dashboard/distribution endpoint and update the certificate and fingerprint test.
