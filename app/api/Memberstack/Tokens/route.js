import memberstackAdmin from '@memberstack/admin';

// Initialize Memberstack outside of the handler for better performance
const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

export default async function handler(req, res) {
  try {
    // Extract token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the token
    const tokenData = await memberstack.verifyToken({
      token,
      audience: process.env.MEMBERSTACK_APP_ID
    });
    
    // Return protected data
    return res.status(200).json({ 
      message: 'Protected data accessed successfully',
      memberId: tokenData.id
    });
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}