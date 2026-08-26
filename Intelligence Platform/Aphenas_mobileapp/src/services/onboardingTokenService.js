import 'dotenv/config';
import jwt from 'jsonwebtoken';


const TOKEN_ISSUER =
  'aphenas-backend';

const TOKEN_AUDIENCE =
  'aphenas-mobile';

const TOKEN_ALGORITHM =
  'HS256';


/* =========================================
   CREATE ONBOARDING TOKEN
========================================= */

export function createOnboardingToken({
  userId,
  serviceId,
}) {

  const secret =
    process.env.ONBOARDING_TOKEN_SECRET;


  if (!secret) {
    throw new Error(
      'ONBOARDING_TOKEN_SECRET is not configured'
    );
  }


  return jwt.sign(
    {
      serviceId,
      purpose: 'onboarding',
    },

    secret,

    {
      algorithm:
        TOKEN_ALGORITHM,

      subject:
        String(userId),

      issuer:
        TOKEN_ISSUER,

      audience:
        TOKEN_AUDIENCE,

      expiresIn:
        '10m',
    }
  );
}


/* =========================================
   VERIFY ONBOARDING TOKEN
========================================= */

export function verifyOnboardingToken(
  token
) {

  const secret =
    process.env.ONBOARDING_TOKEN_SECRET;


  if (!secret) {
    throw new Error(
      'ONBOARDING_TOKEN_SECRET is not configured'
    );
  }


  const payload =
    jwt.verify(
      token,
      secret,
      {
        algorithms: [
          TOKEN_ALGORITHM,
        ],

        issuer:
          TOKEN_ISSUER,

        audience:
          TOKEN_AUDIENCE,
      }
    );


  if (
    payload.purpose !==
    'onboarding'
  ) {
    throw new Error(
      'Invalid onboarding token'
    );
  }


  return {
    userId:
      Number(payload.sub),

    serviceId:
      payload.serviceId,
  };
}