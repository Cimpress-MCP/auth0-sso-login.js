# Change log
This is the changelog for [Auth0 SSO Login](readme.md).

## 4.0 ##
* Redirects will now be returned from the `ensureLoggedIn` function instead of directly executed. In most cases route changing would prevent redirects from working correctly.
* Now parses the returned JWT Hash from Auth0 instead of immediately using the SSO session, which was broken when ITP (Intelligent tracking prevention) was enabled.
