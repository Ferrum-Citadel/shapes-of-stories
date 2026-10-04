# Security policy

Report a vulnerability privately: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue. Say what an attacker can do, give the steps or a request that shows it, and name the commit you tested. The fix is discussed in the private advisory, which is published once the fix is merged. There is no bug bounty.

In scope is this repository's code as the Docker image runs it, in particular:

- a visitor's TypeSafe key being read, logged, kept after its job, or used for requests the visitor did not start;
- passage text being read by another visitor, stored unencrypted, or kept longer than the [README](README.md) says;
- a private or kept work read or changed without its link or session;
- injection, path traversal, server-side request forgery, or a way around the upload, rate and job limits;
- cross-site scripting, or a way around the Content-Security-Policy.

Out of scope: a deployment's own hosting, proxy or TLS setup; TypeSafe's service; denial of service by volume alone; and a flaw in a dependency that this project does not expose, which belongs upstream.
