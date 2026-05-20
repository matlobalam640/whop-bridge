<?php
/**
 * Optional: paste into child theme functions.php (or require this file).
 * Overrides Whopy AJAX to call your Vercel bridge.
 *
 * Also set in Whopy settings: Bridge URL = https://project-k9230.vercel.app/create-payment
 */

if ( ! defined( 'GIO_WHOP_BRIDGE_URL' ) ) {
	define( 'GIO_WHOP_BRIDGE_URL', 'https://project-k9230.vercel.app/create-payment' );
}

add_action( 'wp_ajax_whopy_create_plan', 'gio_override_whopy_create_plan', 0 );
add_action( 'wp_ajax_nopriv_whopy_create_plan', 'gio_override_whopy_create_plan', 0 );

function gio_override_whopy_create_plan() {
	if ( function_exists( 'wc_load_cart' ) ) {
		wc_load_cart();
	}

	$fake_order_id = random_int( 100000, 999999 );
	$amount        = 0;

	if ( WC()->cart ) {
		$amount = (float) WC()->cart->get_total( 'edit' );
	}

	if ( $amount <= 0 ) {
		wp_send_json_error( array( 'message' => 'Cart total missing or empty.' ) );
	}

	$return_url = isset( $_POST['return_url'] )
		? esc_url_raw( wp_unslash( $_POST['return_url'] ) )
		: wc_get_checkout_url();

	$email = '';
	if ( WC()->customer ) {
		$email = WC()->customer->get_billing_email();
	}

	$payload = array(
		'order_id'       => (string) $fake_order_id,
		'amount'         => $amount,
		'currency'       => strtolower( get_woocommerce_currency() ),
		'customer_email' => $email ?: 'test@example.com',
		'return_url'     => $return_url,
		'test_order'     => true,
	);

	$response = wp_remote_post(
		GIO_WHOP_BRIDGE_URL,
		array(
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( $payload ),
			'timeout' => 30,
		)
	);

	if ( is_wp_error( $response ) ) {
		wp_send_json_error( array( 'message' => $response->get_error_message() ) );
	}

	$body = json_decode( wp_remote_retrieve_body( $response ), true );

	if ( empty( $body['success'] ) ) {
		wp_send_json_error(
			array(
				'message'         => $body['error'] ?? 'Unable to create Whop checkout.',
				'bridge_response' => $body,
			)
		);
	}

	wp_send_json_success(
		array(
			'order_id'     => $fake_order_id,
			'checkout_url' => $body['checkout_url'] ?? '',
			'plan_id'      => $body['plan_id'] ?? ( $body['embed']['plan_id'] ?? '' ),
			'session_id'   => $body['session_id'] ?? ( $body['embed']['session_id'] ?? '' ),
			'return_url'   => $return_url,
			'embed'        => $body['embed'] ?? null,
		)
	);
}
