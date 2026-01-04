import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

const products = [
    {
        name: "Pure Ceylon Cinnamon",
        price: 45.00,
        origin: "Sri Lanka",
        rating: 4.8,
        quantity: 150,
        image: "https://images.unsplash.com/photo-1599422315843-ea78a4870502?q=80&w=2070&auto=format&fit=crop",
        category: "Spices",
        description: "High-quality, organic cinnamon sticks directly from the heart of Sri Lanka."
    },
    {
        name: "Handcrafted Silk Scarf",
        price: 85.00,
        origin: "India",
        rating: 4.9,
        quantity: 45,
        image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=1935&auto=format&fit=crop",
        category: "Textiles",
        description: "Traditionally woven silk scarf with intricate patterns and vibrant colors."
    },
    {
        name: "Colombian Arabica Coffee",
        price: 32.50,
        origin: "Colombia",
        rating: 4.7,
        quantity: 200,
        image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=2070&auto=format&fit=crop",
        category: "Beverages",
        description: "Premium single-origin coffee beans roasted to perfection."
    },
    {
        name: "Artisan Olive Oil",
        price: 28.00,
        origin: "Greece",
        rating: 4.6,
        quantity: 120,
        image: "https://images.unsplash.com/photo-1474979266404-7eaacbadcbaf?q=80&w=1929&auto=format&fit=crop",
        category: "Food",
        description: "Cold-pressed extra virgin olive oil from ancient groves in Crete."
    },
    {
        name: "Bamboo Fiber Cutlery",
        price: 15.99,
        origin: "China",
        rating: 4.5,
        quantity: 500,
        image: "https://images.unsplash.com/photo-1591017403286-fd8ba82cf243?q=80&w=2070&auto=format&fit=crop",
        category: "Eco-Friendly",
        description: "Sustainable and biodegradable cutlery set for modern eco-conscious users."
    },
    {
        name: "Moroccan Leather Bag",
        price: 120.00,
        origin: "Morocco",
        rating: 4.8,
        quantity: 30,
        image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=2069&auto=format&fit=crop",
        category: "Fashion",
        description: "Genuine handmade leather bag with traditional Moroccan craftsmanship."
    },
    {
        name: "Japanese Matcha Tea",
        price: 25.00,
        origin: "Japan",
        rating: 4.9,
        quantity: 80,
        image: "https://images.unsplash.com/photo-1582793988951-9aed5509eb97?q=80&w=2071&auto=format&fit=crop",
        category: "Beverages",
        description: "Ceremonial grade matcha powder sourced from Uji, Japan."
    },
    {
        name: "Brazilian Acai Powder",
        price: 39.99,
        origin: "Brazil",
        rating: 4.7,
        quantity: 100,
        image: "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?q=80&w=2070&auto=format&fit=crop",
        category: "Food",
        description: "Organic freeze-dried acai berry powder from the Amazon rainforest."
    }
];

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');

        try {
            await Product.deleteMany({});
            console.log('Cleared existing products');

            await Product.insertMany(products);
            console.log('Seeded products successfully');

            process.exit();
        } catch (error) {
            console.error('Error seeding data:', error);
            process.exit(1);
        }
    })
    .catch((error) => {
        console.log(`${error} did not connect`);
        process.exit(1);
    });
