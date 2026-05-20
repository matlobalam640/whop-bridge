<?php
/**
 * Plugin Name: Whop Bridge Embed Session Fix
 * Plugin URI: https://github.com/matlobalam640/whop-bridge
 * Description: Fixes Whop embedded checkout "page does not exist" by applying session_id or loading the full checkout URL in an iframe.
 * Version: 1.1.0
 * Author: Gio Accessories
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * License: GPL v2 or later
 * Text Domain: whop-embed-session-fix
 */

defined( 'ABSPATH' ) || exit;

add_action( 'wp_enqueue_scripts', function () {
	if ( ! function_exists( 'is_checkout' ) || ! is_checkout() ) {
		return;
	}

	wp_register_script(
		'whop-embed-session-fix',
		plugins_url( 'whop-embed-fix.js', __FILE__ ),
		array( 'jquery' ),
		'1.1.0',
		true
	);

	wp_enqueue_script( 'whop-embed-session-fix' );
}, 20 );
