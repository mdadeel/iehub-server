import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

const products = [
    // === SPICES ===
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
        name: "Kashmir Saffron Threads",
        price: 320.00,
        origin: "India",
        rating: 5.0,
        quantity: 25,
        image: "https://images.unsplash.com/photo-1596040033229-a9821eec9bd1?q=80&w=2070&auto=format&fit=crop",
        category: "Spices",
        description: "World's finest Grade-A saffron threads, hand-picked from Kashmir Valley."
    },
    {
        name: "Sarawak Black Pepper",
        price: 28.00,
        origin: "Malaysia",
        rating: 4.7,
        quantity: 200,
        image: "https://images.unsplash.com/photo-1599909533681-74d284a4b2ad?q=80&w=2070&auto=format&fit=crop",
        category: "Spices",
        description: "Bold and aromatic peppercorns from the rainforests of Borneo."
    },
    {
        name: "Madagascar Vanilla Beans",
        price: 89.00,
        origin: "Madagascar",
        rating: 4.9,
        quantity: 60,
        image: "https://images.unsplash.com/photo-1631206753348-db44968fd440?q=80&w=2069&auto=format&fit=crop",
        category: "Spices",
        description: "Premium Bourbon vanilla beans with rich, creamy flavor profile."
    },

    // === TEXTILES ===
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
        name: "Egyptian Cotton Sheets",
        price: 245.00,
        origin: "Egypt",
        rating: 4.8,
        quantity: 30,
        image: "https://images.unsplash.com/photo-1631049552057-98c63b4f1d90?q=80&w=2070&auto=format&fit=crop",
        category: "Textiles",
        description: "1000-thread count luxury bedding set from the Nile Delta."
    },
    {
        name: "Peruvian Alpaca Blanket",
        price: 189.00,
        origin: "Peru",
        rating: 4.9,
        quantity: 40,
        image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop",
        category: "Textiles",
        description: "Sustainably sourced baby alpaca wool blanket, handwoven by Andean artisans."
    },
    {
        name: "Japanese Indigo Fabric",
        price: 78.00,
        origin: "Japan",
        rating: 4.6,
        quantity: 55,
        image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?q=80&w=2070&auto=format&fit=crop",
        category: "Textiles",
        description: "Traditional Aizome-dyed cotton fabric using natural indigo."
    },

    // === BEVERAGES ===
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
        name: "Darjeeling First Flush Tea",
        price: 55.00,
        origin: "India",
        rating: 4.8,
        quantity: 70,
        image: "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?q=80&w=2070&auto=format&fit=crop",
        category: "Beverages",
        description: "The 'Champagne of Teas' - delicate spring harvest from the Himalayas."
    },
    {
        name: "Ethiopian Yirgacheffe Coffee",
        price: 42.00,
        origin: "Ethiopia",
        rating: 4.9,
        quantity: 90,
        image: "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=2070&auto=format&fit=crop",
        category: "Beverages",
        description: "Floral and citrusy single-origin beans from the birthplace of coffee."
    },
    {
        name: "Vietnamese Robusta Beans",
        price: 22.00,
        origin: "Vietnam",
        rating: 4.5,
        quantity: 150,
        image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=2070&auto=format&fit=crop",
        category: "Beverages",
        description: "Bold, earthy robusta beans perfect for espresso blends."
    },

    // === FOOD ===
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
        name: "Brazilian Acai Powder",
        price: 39.99,
        origin: "Brazil",
        rating: 4.7,
        quantity: 100,
        image: "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?q=80&w=2070&auto=format&fit=crop",
        category: "Food",
        description: "Organic freeze-dried acai berry powder from the Amazon rainforest."
    },
    {
        name: "Italian Truffle Oil",
        price: 75.00,
        origin: "Italy",
        rating: 4.9,
        quantity: 35,
        image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?q=80&w=2070&auto=format&fit=crop",
        category: "Food",
        description: "Infused with real black Périgord truffles from Umbria."
    },
    {
        name: "French Dijon Mustard",
        price: 18.00,
        origin: "France",
        rating: 4.6,
        quantity: 180,
        image: "https://images.unsplash.com/photo-1528750997573-59b89d56f4f7?q=80&w=2070&auto=format&fit=crop",
        category: "Food",
        description: "Authentic stone-ground mustard from Burgundy, France."
    },
    {
        name: "Spanish Manchego Cheese",
        price: 52.00,
        origin: "Spain",
        rating: 4.8,
        quantity: 45,
        image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?q=80&w=2073&auto=format&fit=crop",
        category: "Food",
        description: "Aged DO-certified sheep's milk cheese from La Mancha."
    },
    {
        name: "Thai Coconut Sugar",
        price: 15.00,
        origin: "Thailand",
        rating: 4.5,
        quantity: 250,
        image: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?q=80&w=2070&auto=format&fit=crop",
        category: "Food",
        description: "Unrefined organic coconut palm sugar, low glycemic index."
    },

    // === ECO-FRIENDLY ===
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
        name: "Beeswax Food Wraps",
        price: 24.00,
        origin: "New Zealand",
        rating: 4.7,
        quantity: 120,
        image: "https://images.unsplash.com/photo-1611735341450-74d61e660ad2?q=80&w=2070&auto=format&fit=crop",
        category: "Eco-Friendly",
        description: "Reusable beeswax wraps to replace single-use plastics."
    },
    {
        name: "Cork Yoga Mat",
        price: 68.00,
        origin: "Portugal",
        rating: 4.8,
        quantity: 65,
        image: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?q=80&w=2080&auto=format&fit=crop",
        category: "Eco-Friendly",
        description: "Natural cork surface with recycled rubber base, antimicrobial."
    },
    {
        name: "Recycled Ocean Plastic Bag",
        price: 35.00,
        origin: "Netherlands",
        rating: 4.6,
        quantity: 90,
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=2070&auto=format&fit=crop",
        category: "Eco-Friendly",
        description: "Stylish tote bag made from 100% reclaimed ocean plastics."
    },

    // === FASHION ===
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
        name: "Italian Leather Belt",
        price: 95.00,
        origin: "Italy",
        rating: 4.9,
        quantity: 50,
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=2070&auto=format&fit=crop",
        category: "Fashion",
        description: "Full-grain Florentine leather with hand-finished brass buckle."
    },
    {
        name: "Swiss Automatic Watch",
        price: 1250.00,
        origin: "Switzerland",
        rating: 5.0,
        quantity: 10,
        image: "https://images.unsplash.com/photo-1523275335684-37898b6bae30?q=80&w=2099&auto=format&fit=crop",
        category: "Fashion",
        description: "Precision Swiss movement with sapphire crystal and 50m water resistance."
    },
    {
        name: "Cashmere Scarf",
        price: 185.00,
        origin: "Mongolia",
        rating: 4.9,
        quantity: 35,
        image: "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?q=80&w=2070&auto=format&fit=crop",
        category: "Fashion",
        description: "Grade-A Mongolian cashmere, exceptionally soft and lightweight."
    },

    // === TECH ===
    {
        name: "Wireless Noise-Canceling Headphones",
        price: 349.00,
        origin: "Japan",
        rating: 4.8,
        quantity: 75,
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=2070&auto=format&fit=crop",
        category: "Tech",
        description: "Industry-leading ANC with 30-hour battery life and Hi-Res Audio."
    },
    {
        name: "Mechanical Keyboard",
        price: 189.00,
        origin: "Taiwan",
        rating: 4.7,
        quantity: 60,
        image: "https://images.unsplash.com/photo-1595044426077-d36d9236d54a?q=80&w=2070&auto=format&fit=crop",
        category: "Tech",
        description: "Hot-swappable switches, PBT keycaps, and RGB per-key lighting."
    },
    {
        name: "Portable Power Station",
        price: 599.00,
        origin: "USA",
        rating: 4.9,
        quantity: 25,
        image: "https://images.unsplash.com/photo-1609592424014-b98b2976ed86?q=80&w=2070&auto=format&fit=crop",
        category: "Tech",
        description: "1500Wh capacity with solar charging capability for off-grid power."
    },
    {
        name: "Smart Home Hub",
        price: 129.00,
        origin: "Germany",
        rating: 4.6,
        quantity: 100,
        image: "https://images.unsplash.com/photo-1558089687-f282ffcbc126?q=80&w=2071&auto=format&fit=crop",
        category: "Tech",
        description: "Unified control for Zigbee, Z-Wave, and Matter smart devices."
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
            console.log(`Seeded ${products.length} products successfully`);

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
