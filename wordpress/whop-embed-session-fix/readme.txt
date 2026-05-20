=== Whop Bridge Embed Session Fix ===
Contributors: gioaccessories
Tags: whop, woocommerce, checkout, whopy
Requires at least: 5.8
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later

Fixes Whop embedded checkout showing "page does not exist" when using the Whopy WooCommerce plugin with a Vercel payment bridge.

== Description ==

When your bridge creates a dynamic Whop checkout, Whop returns both plan_id and session_id. The embed must include both. This plugin listens for Whopy AJAX and sets data-whop-checkout-session on the checkout iframe.

== Installation ==

1. Upload the zip via Plugins → Add New → Upload Plugin
2. Activate the plugin
3. Ensure Whopy Bridge URL points to your Vercel /create-payment endpoint

== Changelog ==

= 1.0.1 =
* Support bridge_response nested in Whopy AJAX data

= 1.0.0 =
* Initial release
