<?php
/**
 * Plugin Name: Whop Bridge Embed Session Fix
 * Plugin URI: https://github.com/matlobalam640/whop-bridge
 * Description: Fixes Whop embedded checkout "page does not exist" by passing session_id from your Vercel bridge to the Whopy embed.
 * Version: 1.0.1
 * Author: Gio Accessories
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * License: GPL v2 or later
 * Text Domain: whop-embed-session-fix
 */

defined( 'ABSPATH' ) || exit;

/**
 * After Whopy AJAX creates a plan, attach session_id to the embed container.
 * Whop dynamic checkouts require both plan_id and session_id (ch_...).
 */
add_action( 'wp_footer', function () {
	if ( ! function_exists( 'is_checkout' ) || ! is_checkout() ) {
		return;
	}
	?>
	<script>
	(function () {
		function pickBridgeData(resp) {
			if (!resp || !resp.success || !resp.data) return null;

			var d = resp.data;
			// Whopy may nest bridge JSON under bridge_response
			if (d.bridge_response && d.bridge_response.success) {
				return {
					plan_id: d.bridge_response.plan_id || d.plan_id,
					session_id: d.bridge_response.session_id || d.session_id,
					return_url: d.bridge_response.checkout_url || d.checkout_url
				};
			}

			return {
				plan_id: d.plan_id,
				session_id: d.session_id,
				return_url: d.checkout_url || d.return_url
			};
		}

		function applyWhopSession(data) {
			if (!data || !data.session_id || !data.plan_id) return;

			document.querySelectorAll('[data-whop-checkout-plan-id]').forEach(function (el) {
				el.setAttribute('data-whop-checkout-plan-id', data.plan_id);
				el.setAttribute('data-whop-checkout-session', data.session_id);
				if (data.return_url) {
					el.setAttribute('data-whop-checkout-return-url', data.return_url);
				}
			});

			if (window.wco && typeof window.wco.mount === 'function') {
				var root = document.getElementById('whop-embedded-checkout') ||
					document.querySelector('[data-whop-checkout-plan-id]');
				if (root && root.id) {
					try { window.wco.mount(root.id); } catch (e) {}
				}
			}
		}

		if (window.jQuery) {
			jQuery(document).ajaxSuccess(function (_event, xhr, settings) {
				var url = (settings && settings.url) || '';
				if (url.indexOf('whopy_create_plan') === -1) return;

				var payload = pickBridgeData(xhr.responseJSON);
				if (payload) applyWhopSession(payload);
			});
		}
	})();
	</script>
	<?php
}, 99 );
