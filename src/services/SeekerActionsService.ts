import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { 
  ActionGetResponse, 
  ActionPostRequest,
  ActionPostResponse,
  createActionHeaders,
  ActionError
} from '@solana/actions';
import { SeekerWalletService } from './SeekerWalletService';

/**
 * Seeker Actions Service - Implements Solana Actions and Blinks for NFT operations
 * Replaces mock implementations with proper Actions API
 */
export class SeekerActionsService {
  private connection: Connection;
  private walletService: SeekerWalletService;
  private baseUrl: string;

  constructor(connection: Connection, walletService: SeekerWalletService) {
    this.connection = connection;
    this.walletService = walletService;
    this.baseUrl = 'https://hoshino.game'; // Your domain
  }

  /**
   * Create Character Mint Action
   */
  async createCharacterMintAction(character: any): Promise<ActionGetResponse> {
    const action: ActionGetResponse = {
      type: "action",
      icon: character.image || `${this.baseUrl}/assets/images/${character.name.toLowerCase()}.png`,
      title: `Mint ${character.name}`,
      description: `Create an NFT of ${character.name}, a ${character.element} element moonoko with ${character.rarity} rarity.`,
      label: `Mint ${character.name} NFT`,
      disabled: false,
      links: {
        actions: [
          {
            type: "transaction",
            href: `/api/actions/mint-character/${character.id}`,
            label: `Mint ${character.name}`,
            parameters: []
          }
        ]
      }
    };

    return action;
  }

  /**
   * Create Achievement Mint Action
   */
  async createAchievementMintAction(achievement: any): Promise<ActionGetResponse> {
    const action: ActionGetResponse = {
      type: "action",
      icon: `${this.baseUrl}/assets/images/achievement-badge.png`,
      title: `${achievement.name} Achievement`,
      description: `Mint your ${achievement.name} achievement badge. ${achievement.description}`,
      label: `Claim ${achievement.name}`,
      disabled: false,
      links: {
        actions: [
          {
            type: "transaction", 
            href: `/api/actions/mint-achievement/${achievement.id}`,
            label: `Claim Badge`,
            parameters: []
          }
        ]
      }
    };

    return action;
  }

  /**
   * Create Marketplace Purchase Action
   */
  async createPurchaseAction(item: any): Promise<ActionGetResponse> {
    const action: ActionGetResponse = {
      type: "action",
      icon: item.icon || `${this.baseUrl}/assets/images/shop.png`,
      title: `Buy ${item.name}`,
      description: `Purchase ${item.name} for your moonoko. ${item.description}`,
      label: `Buy for ${item.price} SOL`,
      disabled: false,
      links: {
        actions: [
          {
            type: "transaction",
            href: `/api/actions/purchase/${item.id}`,
            label: `Buy 1x`,
            parameters: []
          },
          {
            type: "transaction",
            href: `/api/actions/purchase/${item.id}?quantity={quantity}`,
            label: `Buy Custom Amount`,
            parameters: [
              {
                name: "quantity",
                label: "Quantity",
                type: "number",
                required: true,
                min: 1,
                max: 10
              }
            ]
          }
        ]
      }
    };

    return action;
  }

  /**
   * Process Character Mint Transaction
   */
  async processCharacterMint(
    characterId: string, 
    account: PublicKey
  ): Promise<ActionPostResponse> {
    try {
      console.log('🎨 Processing character mint via Actions...');

      // Create transaction for character NFT minting
      const transaction = await this.createCharacterMintTransaction(characterId, account);
      
      // Set recent blockhash and fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = account;

      // Serialize transaction for Actions response
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');

      const response: ActionPostResponse = {
        transaction: serializedTransaction,
        message: `✨ ${characterId} NFT ready to mint! This will create your unique moonoko on the blockchain.`,
        links: {
          next: {
            type: "inline",
            action: {
              type: "completed",
              icon: `${this.baseUrl}/assets/images/${characterId}.png`,
              title: "Character Minted!",
              description: `Your ${characterId} NFT has been successfully minted! Welcome to the Hoshino universe.`,
              label: "Minting Complete"
            }
          }
        }
      };

      return response;
    } catch (error) {
      console.error('❌ Character mint action failed:', error);
      throw new Error(`Failed to create mint transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process Achievement Mint Transaction  
   */
  async processAchievementMint(
    achievementId: string,
    account: PublicKey
  ): Promise<ActionPostResponse> {
    try {
      console.log('🏆 Processing achievement mint via Actions...');

      const transaction = await this.createAchievementMintTransaction(achievementId, account);
      
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = account;

      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');

      const response: ActionPostResponse = {
        transaction: serializedTransaction,
        message: `🏆 ${achievementId} achievement badge ready to claim!`,
        links: {
          next: {
            type: "inline", 
            action: {
              type: "completed",
              icon: `${this.baseUrl}/assets/images/achievement-badge.png`,
              title: "Achievement Unlocked!",
              description: `Congratulations! You've earned the ${achievementId} achievement badge.`,
              label: "Achievement Complete"
            }
          }
        }
      };

      return response;
    } catch (error) {
      console.error('❌ Achievement mint action failed:', error);
      throw new Error(`Failed to create achievement transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create the actual NFT mint transaction (placeholder - implement with proper NFT minting)
   */
  private async createCharacterMintTransaction(characterId: string, account: PublicKey): Promise<Transaction> {
    // This would contain the actual NFT minting instructions
    // For now, return a placeholder transaction
    const transaction = new Transaction();
    
    // TODO: Add proper programmable NFT mint instructions using @metaplex-foundation/mpl-token-metadata
    
    console.log(`🔄 Creating mint transaction for character: ${characterId}`);
    return transaction;
  }

  /**
   * Create achievement mint transaction
   */
  private async createAchievementMintTransaction(achievementId: string, account: PublicKey): Promise<Transaction> {
    const transaction = new Transaction();
    
    // TODO: Add proper achievement NFT mint instructions
    
    console.log(`🔄 Creating achievement mint transaction for: ${achievementId}`);
    return transaction;
  }

  /**
   * Create Blink URL for sharing
   */
  createBlinkUrl(actionType: 'character' | 'achievement' | 'purchase', itemId: string): string {
    const actionUrl = `${this.baseUrl}/api/actions/${actionType}/${itemId}`;
    const encodedActionUrl = encodeURIComponent(`solana-action:${actionUrl}`);
    return `https://dial.to/?action=${encodedActionUrl}`;
  }

  /**
   * Validate Actions request headers
   */
  validateActionHeaders(headers: Record<string, string>): boolean {
    const requiredHeaders = createActionHeaders();
    return Object.keys(requiredHeaders).every(key => headers[key] !== undefined);
  }

  /**
   * Create error response for Actions
   */
  createErrorResponse(message: string): ActionError {
    return { message };
  }

  /**
   * Get Seeker device capabilities for Actions
   */
  getSeekerCapabilities() {
    return {
      seedVaultSupported: this.walletService.isSeekerDevice(),
      actionsSupported: true,
      blinksSupported: true,
      device: this.walletService.isSeekerDevice() ? 'seeker' : 'mobile'
    };
  }
} 