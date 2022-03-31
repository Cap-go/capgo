import type { Handler } from '@netlify/functions'

export const handler: Handler = async(event) => {

}
export const events = runWith(runtimeOpts).https.onRequest(async(request, response) => {
  try {
    const event = parseStripeEvent(request, config().stripe.key, config().stripe.endpoint)
    try {
      const snapshot = await firestore()
        .collection('/stripe_events')
        .add(event)
      const data = extractDataEvent(event)
      const userUID = await findUserUID(data.email, data.update.customerId || null)
      if (data.email) {
        try {
          await firestore()
            .collection('accounts')
            .doc(userUID)
            .set(data.update, { merge: true })
        }
        catch (err) {
          sentry.captureException(err)
          console.error('Error update user for payment:', err)
          return response.status(500).end()
        }
      }
      return response.json({ received: true, ref: snapshot.id }).end()
    }
    catch (err) {
      sentry.captureException(err)
      console.error('Event error', err)
      return response.status(500).end()
    }
  }
  catch (err) {
    sentry.captureException(err)
    console.error('Parse Event error', err)
    return response.status(400).end() // Signing signature failure, return an error 400
  }
})
