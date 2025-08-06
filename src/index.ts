// src/index.ts
import dotenv from 'dotenv';
import { TrustBrokerClient } from 'trustbroker-client';

dotenv.config();

async function main() {
  const client = new TrustBrokerClient();
  console.log('Client initialized:', client.getClientId());

  // 1. Get own institution
  const myInstitution = await client.getMyInstitution();
  console.log('My Institution:', myInstitution);

  // 2. Get platform public key
  const platformPublicKey = await client.getPublicKey();
  console.log('Platform Public Key:', platformPublicKey);

  // 3. Create a new DataRequest
  const providerId = 'cmdylgn4e000dujd856q39isa'; // <-- define this here
  const dataOwnerId = 'cmdylgn4w000jujd8kuv4a40b'; // <-- and others too
  const schemaId = 'cmdylgn320004ujd82kv1oskl';
  const relationshipId = 'cmdylgn5r000mujd8f6oue97z';
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const created = await client.createDataRequest({
    providerId,
    dataOwnerId,
    schemaId,
    relationshipId,
    expiresAt,
  });

  console.log('Created Request:', created);
  const requestId = created.requestId;

  // 4. Poll until request is APPROVED
  console.log('Polling for approval...');
  let status = await client.getRequestStatus(requestId);
  const timeout = Date.now() + 60_000; // wait up to 60s
  while (status.status !== 'APPROVED') {
    if (Date.now() > timeout) {
      throw new Error('Timed out waiting for approval');
    }
    await new Promise((r) => setTimeout(r, 2000));
    status = await client.getRequestStatus(requestId);
    console.log('Request status:', status.status);
  }

  const { platformSignature, providerEndpoint } = status;
  if (!platformSignature || !providerEndpoint) {
    throw new Error('Missing platform signature or provider endpoint');
  }

  // 5. Generate signature for the provider
  const payloadForProvider = {
    requesterId: client.getClientId(),
    platformSignature,
    requestId,
  };
  const requesterSignature = client.signPayload(payloadForProvider);

  // 6. Fetch data from provider
  const providerData = await client.requestDataFromProvider(
    requestId,
    platformSignature,
    requesterSignature,
    providerEndpoint,
  );

  console.log('Received data from provider:', providerData);

  // 7. Fetch provider's institution public key
  const providerInfo = await client.getInstitutionById(providerId);
  const providerPublicKey = providerInfo.publicKey;

  // 8. Verify provider signature
  const payloadForVerification = {
    requesterId: client.getClientId(),
    providerId: providerId,
    dataOwnerId: 'dataowner-456',
    relationshipId: 'rel-000',
    expiresAt,
  };
  const isValid = client.verifyPayloadSignature(
    payloadForVerification,
    providerData.signature,
    providerPublicKey,
  );
  console.log('Provider signature valid:', isValid);

  // 9. Submit final signature
  const requesterFinalSignature = client.signPayload(payloadForVerification);
  const finalResult = await client.submitRequesterSignature(
    requestId,
    providerId,
    providerData.signature,
    platformSignature,
    requesterFinalSignature,
  );

  console.log('Final request status:', finalResult);
}

main().catch((err) => {
  console.error('Error during test:', err);
});
