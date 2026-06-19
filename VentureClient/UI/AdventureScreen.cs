using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
using Myra.Graphics2D.UI;
using Myra.Graphics2D.Brushes;
using VentureClient.Models;
using VentureClient.Network;

namespace VentureClient.UI
{
    public class AdventureScreen : IScreen
    {
        private Panel _mainPanel;
        
        // HUD labels
        private Label _hudLabel;
        private Button _btnVentureDeeper;
        private Button _btnReturnHome;
        private Button _btnEndTurn;

        // Board & Logs
        private Grid _cardsGrid;
        private VerticalStackPanel _logPanel;
        private ScrollViewer _logScroll;
        private TextBox _chatInput;

        // Action Slots (Spells & Weapon)
        private HorizontalStackPanel _actionSlotsPanel;
        private int? _selectedSpellIndex = null;
        private bool _weaponAttackSelected = false;

        public void Initialize()
        {
            _mainPanel = new Panel();

            // Main Grid Layout
            var grid = new Grid
            {
                RowSpacing = 10,
                ColumnSpacing = 15,
                Padding = new Myra.Graphics2D.Thickness(15)
            };
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Top Navigation Bar
            grid.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Game Board and Log Panels
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Action Bar
            
            grid.ColumnsProportions.Add(new Proportion(ProportionType.Fill)); // Left Side (Board)
            grid.ColumnsProportions.Add(new Proportion(ProportionType.Pixels, 350)); // Right Side (Logs & Chat)

            // --- 1. TOP NAVIGATION BAR ---
            var topBar = new HorizontalStackPanel
            {
                Spacing = 20,
                Padding = new Myra.Graphics2D.Thickness(0, 0, 0, 10)
            };
            Grid.SetRow(topBar, 0);
            Grid.SetColumnSpan(topBar, 2);

            _hudLabel = new Label
            {
                Text = GetHudText(),
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Gold
            };
            topBar.Widgets.Add(_hudLabel);

            _btnVentureDeeper = MyraExtensions.CreateButton("⚔️ Venture Deeper", VentureGame.Instance.SmallFont);
            _btnVentureDeeper.Height = 35;
            _btnVentureDeeper.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "ventureDeeper" });
            };
            topBar.Widgets.Add(_btnVentureDeeper);

            _btnReturnHome = MyraExtensions.CreateButton("🏠 Return Home", VentureGame.Instance.SmallFont);
            _btnReturnHome.Height = 35;
            _btnReturnHome.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "returnHome" });
            };
            topBar.Widgets.Add(_btnReturnHome);

            _btnEndTurn = MyraExtensions.CreateButton("🛡️ End Turn", VentureGame.Instance.SmallFont);
            _btnEndTurn.Height = 35;
            _btnEndTurn.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "endTurn" });
                _btnEndTurn.Enabled = false;
            };
            topBar.Widgets.Add(_btnEndTurn);

            grid.Widgets.Add(topBar);

            // --- 2. GAME BOARD (LEFT COLUMN) ---
            _cardsGrid = new Grid
            {
                RowSpacing = 10,
                ColumnSpacing = 10
            };
            Grid.SetRow(_cardsGrid, 1);
            Grid.SetColumn(_cardsGrid, 0);

            for (int idx = 0; idx < 3; idx++)
            {
                _cardsGrid.ColumnsProportions.Add(new Proportion(ProportionType.Fill));
                _cardsGrid.RowsProportions.Add(new Proportion(ProportionType.Fill));
            }
            grid.Widgets.Add(_cardsGrid);

            // --- 3. LOGS & ZONE CHAT (RIGHT COLUMN) ---
            var rightColumn = new Grid
            {
                RowSpacing = 10
            };
            Grid.SetRow(rightColumn, 1);
            Grid.SetColumn(rightColumn, 1);

            rightColumn.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Logs panel
            rightColumn.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Chat Input row

            _logPanel = new VerticalStackPanel { Spacing = 4 };
            _logScroll = new ScrollViewer
            {
                Content = _logPanel
            };
            Grid.SetRow(_logScroll, 0);
            rightColumn.Widgets.Add(_logScroll);

            var chatRow = new Grid { ColumnSpacing = 10 };
            Grid.SetRow(chatRow, 1);
            chatRow.ColumnsProportions.Add(new Proportion(ProportionType.Fill));
            chatRow.ColumnsProportions.Add(new Proportion(ProportionType.Auto));

            _chatInput = new TextBox { Font = VentureGame.Instance.SmallFont };
            _chatInput.KeyDown += async (s, e) =>
            {
                if (e.Data == Keys.Enter)
                {
                    await SendZoneMessage();
                }
            };
            
            var btnSend = MyraExtensions.CreateButton("Send", VentureGame.Instance.SmallFont);
            btnSend.Width = 65;
            btnSend.Click += async (s, e) =>
            {
                await SendZoneMessage();
            };

            chatRow.Widgets.Add(_chatInput);
            chatRow.Widgets.Add(btnSend);
            Grid.SetColumn(btnSend, 1);
            rightColumn.Widgets.Add(chatRow);

            grid.Widgets.Add(rightColumn);

            // --- 4. ACTION BAR (BOTTOM ROW) ---
            _actionSlotsPanel = new HorizontalStackPanel
            {
                Spacing = 12,
                Padding = new Myra.Graphics2D.Thickness(0, 10, 0, 0)
            };
            Grid.SetRow(_actionSlotsPanel, 2);
            Grid.SetColumnSpan(_actionSlotsPanel, 2);
            grid.Widgets.Add(_actionSlotsPanel);

            _mainPanel.Widgets.Add(grid);

            // Register Listeners
            VentureGame.Instance.Network.OnCharacterUpdate += HandleCharacterUpdate;
            VentureGame.Instance.Network.OnAdventureUpdate += HandleAdventureUpdate;
            VentureGame.Instance.Network.OnZoneChatMessage += HandleZoneChat;
            VentureGame.Instance.Network.OnAdventureEnded += HandleAdventureEnded;

            // Perform initial renders
            RefreshHUD();
            RefreshBoard();
            RefreshActionBar();
            AppendLogMessage("System", "Entered the adventure zone. Defeat monsters and collect loot!", Color.Gray);
        }

        public void LoadContent()
        {
            VentureGame.Instance.Desktop.Root = _mainPanel;
        }

        private string GetHudText()
        {
            var charState = VentureGame.Instance.CharacterState;
            var advState = VentureGame.Instance.AdventureState;
            string zone = advState?.Zone ?? "Adventure";
            if (charState == null) return $"📍 {zone}";
            return $"📍 {zone}  |  ❤️ HP: {charState.Health}/{charState.MaxHealth} (🛡️ Shield: {charState.Shield})  |  ⚡ AP: {charState.ActionPoints}";
        }

        private void RefreshHUD()
        {
            _hudLabel.Text = GetHudText();
            _btnEndTurn.Enabled = true;
        }

        private void RefreshBoard()
        {
            _cardsGrid.Widgets.Clear();
            var advState = VentureGame.Instance.AdventureState;
            if (advState?.Cards == null) return;

            int row = 0, col = 0;
            for (int i = 0; i < advState.Cards.Count; i++)
            {
                var card = advState.Cards[i];
                if (card == null) continue;

                int cardIndex = i; // capture index for closures
                
                // Create card UI widget
                var cardBox = new VerticalStackPanel
                {
                    Spacing = 5,
                    Padding = new Myra.Graphics2D.Thickness(10),
                    Background = new SolidBrush(new Color(40, 36, 36))
                };
                Grid.SetRow(cardBox, row);
                Grid.SetColumn(cardBox, col);

                // Add border hover/selection style
                var lblIcon = new Label
                {
                    Text = card.Icon,
                    Font = VentureGame.Instance.MainFont,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                cardBox.Widgets.Add(lblIcon);

                var lblName = new Label
                {
                    Text = card.Name,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.White,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                cardBox.Widgets.Add(lblName);

                if (card.Health > 0)
                {
                    var lblHP = new Label
                    {
                        Text = $"HP: {card.Health}/{card.MaxHealth}",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.Red,
                        HorizontalAlignment = HorizontalAlignment.Center
                    };
                    cardBox.Widgets.Add(lblHP);
                }

                var btnInteract = MyraExtensions.CreateButton("Interact", VentureGame.Instance.SmallFont);
                btnInteract.Height = 28;
                btnInteract.Click += async (s, e) =>
                {
                    await PerformCardInteraction(cardIndex, card);
                };
                cardBox.Widgets.Add(btnInteract);

                _cardsGrid.Widgets.Add(cardBox);

                col++;
                if (col >= 3)
                {
                    col = 0;
                    row++;
                }
            }
        }

        private void RefreshActionBar()
        {
            _actionSlotsPanel.Widgets.Clear();
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            // Add basic Attack (Weapon) slot
            string weaponText = charState.Equipment?.MainHand != null 
                ? $"⚔️ Attack ({charState.Equipment.MainHand.Name})"
                : "👊 Punch";
            
            var btnWeapon = MyraExtensions.CreateButton(weaponText, VentureGame.Instance.SmallFont);
            btnWeapon.Height = 40;
            btnWeapon.Background = _weaponAttackSelected ? new SolidBrush(Color.DarkGoldenrod) : null;
            btnWeapon.Click += (s, e) =>
            {
                _weaponAttackSelected = !_weaponAttackSelected;
                _selectedSpellIndex = null;
                RefreshActionBar();
            };
            _actionSlotsPanel.Widgets.Add(btnWeapon);

            // Add Spell slots
            if (charState.Spellbook != null)
            {
                for (int i = 0; i < charState.Spellbook.Count; i++)
                {
                    var spell = charState.Spellbook[i];
                    int spellIndex = i;
                    
                    bool isSelected = _selectedSpellIndex == spellIndex;
                    var btnSpell = MyraExtensions.CreateButton($"{spell.Icon} {spell.Name} (AP: {spell.Cost})", VentureGame.Instance.SmallFont);
                    btnSpell.Height = 40;
                    btnSpell.Background = isSelected ? new SolidBrush(Color.DarkGoldenrod) : null;
                    btnSpell.Click += (s, e) =>
                    {
                        if (isSelected)
                        {
                            _selectedSpellIndex = null;
                        }
                        else
                        {
                            _selectedSpellIndex = spellIndex;
                            _weaponAttackSelected = false;
                        }
                        RefreshActionBar();
                    };
                    _actionSlotsPanel.Widgets.Add(btnSpell);
                }
            }
        }

        private async System.Threading.Tasks.Task PerformCardInteraction(int cardIndex, CardState card)
        {
            // If weapon attack is selected
            if (_weaponAttackSelected)
            {
                var payload = new { weaponSlot = "mainHand", targetIndex = cardIndex };
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "weaponAttack", payload });
                _weaponAttackSelected = false;
                RefreshActionBar();
                return;
            }

            // If spell casting is selected
            if (_selectedSpellIndex.HasValue)
            {
                var payload = new { spellIndex = _selectedSpellIndex.Value, targetIndex = cardIndex.ToString() };
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "castSpell", payload });
                _selectedSpellIndex = null;
                RefreshActionBar();
                return;
            }

            // Default: Generic interaction
            await VentureGame.Instance.Network.EmitPartyAction(new { type = "interactWithCard", payload = new { cardIndex } });
        }

        private async System.Threading.Tasks.Task SendZoneMessage()
        {
            string msg = _chatInput.Text.Trim();
            if (!string.IsNullOrEmpty(msg))
            {
                _chatInput.Text = "";
                await VentureGame.Instance.Network.EmitZoneChatMessage(msg);
            }
        }

        private void AppendLogMessage(string sender, string message, Color color)
        {
            if (_logPanel == null) return;
            var lbl = new Label
            {
                Text = $"[{sender}]: {message}",
                Font = VentureGame.Instance.SmallFont,
                TextColor = color,
                Wrap = true
            };
            _logPanel.Widgets.Add(lbl);
            _logScroll.ScrollPosition = new Point(0, _logPanel.Bounds.Height);
        }

        // --- NETWORK EVENT HANDLERS ---
        private void HandleCharacterUpdate(CharacterState character)
        {
            RefreshHUD();
            RefreshActionBar();
        }

        private void HandleAdventureUpdate(AdventureState adventure)
        {
            RefreshHUD();
            RefreshBoard();
            
            // Append any new log messages from server
            if (adventure.Logs != null && adventure.Logs.Count > 0)
            {
                _logPanel.Widgets.Clear();
                foreach (var log in adventure.Logs)
                {
                    Color c = log.Type == "combat" ? Color.LightCoral : Color.LightGray;
                    AppendLogMessage("CombatLog", log.Message, c);
                }
            }
        }

        private void HandleZoneChat(string sender, string message)
        {
            AppendLogMessage(sender, message, Color.LightSkyBlue);
        }

        private void HandleAdventureEnded()
        {
            // Transition back to Main Hub
            VentureGame.Instance.ScreenManager.ChangeScreen(new MainHubScreen());
        }

        public void Update(GameTime gameTime)
        {
        }

        public void Draw(SpriteBatch spriteBatch, GameTime gameTime)
        {
        }

        public void Unload()
        {
            if (VentureGame.Instance?.Network != null)
            {
                VentureGame.Instance.Network.OnCharacterUpdate -= HandleCharacterUpdate;
                VentureGame.Instance.Network.OnAdventureUpdate -= HandleAdventureUpdate;
                VentureGame.Instance.Network.OnZoneChatMessage -= HandleZoneChat;
                VentureGame.Instance.Network.OnAdventureEnded -= HandleAdventureEnded;
            }
        }
    }
}
