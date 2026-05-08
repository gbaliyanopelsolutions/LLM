module.exports = (req, res) => {
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.status(200).send(
		JSON.stringify({
			ok: true,
			hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
			model: process.env.ANTHROPIC_MODEL || null,
		})
	);
};

