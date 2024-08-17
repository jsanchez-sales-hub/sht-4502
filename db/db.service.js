const knx = require('./db');
const Card = require('./models/card.model');
const PaymentAttempt = require('./models/payment-attempt.model');

class DbService {
	knx = knx;

	saveCard() {
		// TODO
	}
}

module.exports = new DbService();
