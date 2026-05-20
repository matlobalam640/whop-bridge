<?php
/**
 * Plugin Name: Whop Bridge Embed Session Fix
 * Description: Passes session_id to Whop embedded checkout (fixes "page does not exist").
 * Version: 1.0.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * After Whopy AJAX creates a plan, attach session_id to the embed container.
 */
add_action( 'wp_footer', function () {
	if ( ! function_exists( 'is_checkout' ) || ! is_checkout() ) {
		return;
	}
	?>
	<script>
	(function () {
		function applyWhopSession(data) {
			if (!data || !data.session_id || !data.plan_id) return;

			document.querySelectorAll('[data-whop-checkout-plan-id]').forEach(function (el) {
				el.setAttribute('data-whop-checkout-plan-id', data.plan_id);
				el.setAttribute('data-whop-checkout-session', data.session_id);
				if (data.return_url) {
					el.setAttribute('data-whop-checkout-return-url', data.return_url);
				}
			});

			// Re-run Whop loader if already on page
			if (window.wco && typeof window.wco.mount === 'function') {
				var root = document.getElementById('whop-embedded-checkout') || document.querySelector('[data-whop-checkout-plan-id]');
				if (root && root.id) {
					try { window.wco.mount(root.id); } catch (e) {}
				}
			}
		}

		// Whopy admin-ajax action
		if (window.jQuery) {
			jQuery(document).ajaxSuccess(function (_event, xhr, settings) {
				var url = (settings && settings.url) || '';
				if (url.indexOf('whopy_create_plan') === -1) return;

				var resp = xhr.responseJSON;
				if (!resp || !resp.success || !resp.data) return;

				applyWhopSession({
					plan_id: resp.data.plan_id,
					session_id: resp.data.session_id,
					return_url: resp.data.return_url || resp.data.checkout_url
				});
			});
		}
	})();
	</script>
	<?php
}, 99 );
