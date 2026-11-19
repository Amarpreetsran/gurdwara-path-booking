// Open /.netlify/functions/wa-test in a browser to check the WhatsApp setup.
// Works only while WA_TEST_TO is set, and sends Meta's ready-made "hello_world" message to that number.
import { sendTemplate, toNumber } from '../lib/gpb.mjs';

export default async () => {
  if (!(process.env.WA_TEST_TO || '').trim()) return new Response('Test sending is off (WA_TEST_TO is not set).', { status: 403 });
  try {
    const id = await sendTemplate(toNumber(''), 'hello_world', [], 'en_US');
    return new Response('Sent. Check WhatsApp on ' + process.env.WA_TEST_TO + '. Message id: ' + id);
  } catch (e) {
    return new Response('Could not send: ' + (e.message || e), { status: 500 });
  }
};
