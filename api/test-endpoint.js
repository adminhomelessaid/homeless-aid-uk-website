module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ 
        message: 'Endpoint working!', 
        method: req.method,
        timestamp: new Date().toISOString()
    });
};