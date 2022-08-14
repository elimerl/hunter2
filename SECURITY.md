# Securely storing passwords

NOTE: I am NOT a security expert, check out [this article](https://jojozhuang.github.io/architecture/how-to-store-passwords-in-a-secure-way/) for some more useful info.

## NEVER STORE PASSWORDS IN PLAINTEXT.

Don't encrypt them, don't use SHA-2 or MD5.

Use [bcrypt](https://npmjs.com/bcryptjs).
