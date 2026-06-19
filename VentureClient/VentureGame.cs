using System;
using System.IO;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Myra;
using Myra.Graphics2D.UI;
using FontStashSharp;
using VentureClient.Models;
using VentureClient.Network;
using VentureClient.UI;

namespace VentureClient
{
    public class VentureGame : Game
    {
        private GraphicsDeviceManager _graphics;
        private SpriteBatch _spriteBatch;

        public static VentureGame Instance { get; private set; }
        
        // Network
        public NetworkManager Network { get; private set; }

        // Global Game States
        public CharacterState CharacterState { get; set; }
        public PartyState PartyState { get; set; }
        public AdventureState AdventureState { get; set; }
        public bool InAdventure { get; set; }

        // Local Database Loaded from JSON
        public List<ItemData> AllItems { get; private set; }
        public List<SpellData> AllSpells { get; private set; }
        public Dictionary<string, List<CardData>> CardPools { get; private set; }
        public List<CardData> SpecialCards { get; private set; }
        public List<RecipeData> CraftingRecipes { get; private set; }

        // UI & Fonts
        public Desktop Desktop { get; private set; }
        public FontSystem FontSystem { get; private set; }
        public SpriteFontBase MainFont { get; private set; }
        public SpriteFontBase SmallFont { get; private set; }

        // Screen Manager
        public ScreenManager ScreenManager { get; private set; }

        public VentureGame()
        {
            Instance = this;
            _graphics = new GraphicsDeviceManager(this);
            _graphics.PreferredBackBufferWidth = 1280;
            _graphics.PreferredBackBufferHeight = 720;

            Content.RootDirectory = "Content";
            IsMouseVisible = true;
            Window.AllowUserResizing = true;
        }

        protected override void Initialize()
        {
            MyraEnvironment.Game = this;

            // Load Game Data JSONs
            LoadGameData();

            // Setup Screen Manager
            ScreenManager = new ScreenManager();

            // Setup Network Client (Connects to the server)
            Network = new NetworkManager("https://venturecrpg.onrender.com");
            SetupNetworkHandlers();

            base.Initialize();
        }

        private void LoadGameData()
        {
            try
            {
                string dataPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Content", "data");
                
                AllItems = JsonConvert.DeserializeObject<List<ItemData>>(
                    File.ReadAllText(Path.Combine(dataPath, "allItems.json")));
                
                AllSpells = JsonConvert.DeserializeObject<List<SpellData>>(
                    File.ReadAllText(Path.Combine(dataPath, "allSpells.json")));

                CardPools = JsonConvert.DeserializeObject<Dictionary<string, List<CardData>>>(
                    File.ReadAllText(Path.Combine(dataPath, "cardPools.json")));

                SpecialCards = JsonConvert.DeserializeObject<List<CardData>>(
                    File.ReadAllText(Path.Combine(dataPath, "specialCards.json")));

                CraftingRecipes = JsonConvert.DeserializeObject<List<RecipeData>>(
                    File.ReadAllText(Path.Combine(dataPath, "craftingRecipes.json")));

                Console.WriteLine($"Successfully loaded data: {AllItems.Count} items, {AllSpells.Count} spells, {CraftingRecipes.Count} recipes.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading game data: {ex.Message}");
            }
        }

        private void SetupNetworkHandlers()
        {
            Network.OnConnected += () =>
            {
                Console.WriteLine("Connected to the server!");
            };

            Network.OnDisconnected += () =>
            {
                Console.WriteLine("Disconnected from the server!");
            };

            Network.OnCharacterUpdate += (state) =>
            {
                CharacterState = state;
                Console.WriteLine($"Received character update: {state.CharacterName}");
            };

            Network.OnPartyUpdate += (state) =>
            {
                PartyState = state;
                Console.WriteLine($"Received party update: Members count = {state.Members.Count}");
            };

            Network.OnAdventureUpdate += (state) =>
            {
                AdventureState = state;
                Console.WriteLine($"Received adventure update: Zone = {state.Zone}");
            };

            Network.OnAdventureStarted += () =>
            {
                InAdventure = true;
                Console.WriteLine("Adventure started!");
            };

            Network.OnAdventureEnded += () =>
            {
                InAdventure = false;
                Console.WriteLine("Adventure ended!");
            };
        }

        protected override void LoadContent()
        {
            _spriteBatch = new SpriteBatch(GraphicsDevice);
            Desktop = new Desktop();

            // Load Font System
            FontSystem = new FontSystem();
            
            // Try to load standard TTF font
            string fontPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Content", "fonts", "arial.ttf");
            if (File.Exists(fontPath))
            {
                FontSystem.AddFont(File.ReadAllBytes(fontPath));
            }
            
            // Add emoji font fallback if possible
            string emojiFontPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Content", "fonts", "seguiemj.ttf");
            if (File.Exists(emojiFontPath))
            {
                FontSystem.AddFont(File.ReadAllBytes(emojiFontPath));
            }

            MainFont = FontSystem.GetFont(18);
            SmallFont = FontSystem.GetFont(14);

            // Initialize connection asynchronously
            Task.Run(async () =>
            {
                try
                {
                    await Network.InitializeAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error connecting to server: {ex.Message}");
                }
            });

            // Start in Character Select Screen
            ScreenManager.ChangeScreen(new CharacterSelectScreen());
        }

        protected override void Update(GameTime gameTime)
        {
            // Update current Screen
            ScreenManager.Update(gameTime);

            base.Update(gameTime);
        }

        protected override void Draw(GameTime gameTime)
        {
            GraphicsDevice.Clear(new Color(24, 20, 20)); // Sleek dark charcoal background

            // 1. Draw C# rendering elements if any
            _spriteBatch.Begin();
            ScreenManager.Draw(_spriteBatch, gameTime);
            _spriteBatch.End();

            // 2. Draw Myra UI
            Desktop.Render();

            base.Draw(gameTime);
        }

        protected override void OnExiting(object sender, ExitingEventArgs args)
        {
            Network?.DisconnectAsync().Wait();
            base.OnExiting(sender, args);
        }
    }
}
