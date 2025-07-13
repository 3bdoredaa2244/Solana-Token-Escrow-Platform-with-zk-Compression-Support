import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';

export interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export const validateRequest = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate body
    if (schema.body) {
      const { error } = schema.body.validate(req.body);
      if (error) {
        errors.push(`Body: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate query
    if (schema.query) {
      const { error } = schema.query.validate(req.query);
      if (error) {
        errors.push(`Query: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate params
    if (schema.params) {
      const { error } = schema.params.validate(req.params);
      if (error) {
        errors.push(`Params: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    if (errors.length > 0) {
      throw new AppError(`Validation failed: ${errors.join('; ')}`, 400);
    }

    next();
  };
};

// Common validation schemas
export const schemas = {
  publicKey: Joi.string().length(44).pattern(/^[A-Za-z0-9+/]*={0,2}$/),
  
  createEscrow: Joi.object({
    seller: Joi.string().length(44).required(),
    tokenMint: Joi.string().length(44).required(),
    amount: Joi.string().pattern(/^\d+$/).required(),
    timeoutDuration: Joi.number().integer().min(3600).max(2592000).default(172800), // 1 hour to 30 days, default 48 hours
    itemDescription: Joi.string().min(1).max(256).required(),
    fulfillmentLink: Joi.string().uri().max(512).required(),
    moderator: Joi.string().length(44).optional()
  }),

  createDispute: Joi.object({
    reason: Joi.string().min(10).max(512).required(),
    evidence: Joi.string().min(10).max(1024).required()
  }),

  resolveDispute: Joi.object({
    releaseToSeller: Joi.boolean().required(),
    resolutionNotes: Joi.string().min(10).max(512).required()
  }),

  escrowId: Joi.object({
    escrowId: Joi.string().length(44).required()
  }),

  walletAddress: Joi.object({
    address: Joi.string().length(44).required()
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('createdAt', 'amount', 'state').default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};