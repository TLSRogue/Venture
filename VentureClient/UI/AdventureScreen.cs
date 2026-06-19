using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
using Myra.Graphics2D;
using Myra.Graphics2D.UI;
using Myra.Graphics2D.Brushes;
using Myra.Graphics2D.TextureAtlases;
using FontStashSharp;
using VentureClient.Models;
using VentureClient.Network;

namespace VentureClient.UI
{
    public class AdventureScreen : IScreen
    {
        private Panel _mainPanel;
        
        // HUD (Row 0)
        private Panel _hudHpBarContainer;
        private Label _lblAp;

        // Board (Row 1)
        private HorizontalStackPanel _boardContainer;

        // Player Card & Navigation (Row 2)
        private Label _lblPlayerName;
        private Image _playerImg;
        private Panel _playerHpBarContainer;
        private Panel _playerShieldBarContainer;
        private Panel _playerApBarContainer;
        private Button _btnReturnHome;
        private Button _btnVentureDeeper;

        // Action Tray (Row 3)
        private HorizontalStackPanel _gearRow;
        private HorizontalStackPanel _spellsRow;
        private Button _btnEndTurn;

        // Logs & Chat (Row 4)
        private VerticalStackPanel _logPanel;
        private ScrollViewer _logScroll;
        private TextBox _chatInput;

        // Interaction States
        private int? _selectedSpellIndex = null;
        private bool _weaponAttackSelected = false;

        public void Initialize()
        {
            _mainPanel = new Panel();

            // Main Grid Layout
            var grid = new Grid
            {
                RowSpacing = 8,
                Padding = new Thickness(15),
                Background = new SolidBrush(new Color(20, 24, 30, 210)), // Dark semi-transparent slate background
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch,
                Margin = new Thickness(60, 15, 60, 15)
            };

            // Define 5 rows
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto));  // Row 0: HUD
            grid.RowsProportions.Add(new Proportion(ProportionType.Fill));  // Row 1: Board
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto));  // Row 2: Player & Nav
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto));  // Row 3: Action Tray
            grid.RowsProportions.Add(new Proportion(ProportionType.Pixels, 160)); // Row 4: Logs & Chat

            // --- ROW 0: HUD ---
            var hudGrid = new Grid { ColumnSpacing = 15 };
            hudGrid.ColumnsProportions.Add(new Proportion(ProportionType.Fill));
            hudGrid.ColumnsProportions.Add(new Proportion(ProportionType.Auto));

            _hudHpBarContainer = new Panel { VerticalAlignment = VerticalAlignment.Center };
            Grid.SetColumn(_hudHpBarContainer, 0);
            hudGrid.Widgets.Add(_hudHpBarContainer);

            var apPill = new Panel
            {
                Background = new SolidBrush(new Color(230, 180, 40)),
                Padding = new Thickness(12, 4),
                VerticalAlignment = VerticalAlignment.Center
            };
            _lblAp = new Label
            {
                Text = "⚡ AP: 0",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Black
            };
            apPill.Widgets.Add(_lblAp);
            Grid.SetColumn(apPill, 1);
            hudGrid.Widgets.Add(apPill);

            Grid.SetRow(hudGrid, 0);
            grid.Widgets.Add(hudGrid);

            // --- ROW 1: BOARD ---
            _boardContainer = new HorizontalStackPanel
            {
                Spacing = 15,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetRow(_boardContainer, 1);
            grid.Widgets.Add(_boardContainer);

            // --- ROW 2: PLAYER & NAV ---
            var row2Grid = new Grid { ColumnSpacing = 20 };
            row2Grid.ColumnsProportions.Add(new Proportion(ProportionType.Fill)); // Return Home
            row2Grid.ColumnsProportions.Add(new Proportion(ProportionType.Auto)); // Player Card
            row2Grid.ColumnsProportions.Add(new Proportion(ProportionType.Fill)); // Venture Deeper

            // Return Home button (rust-red styled)
            _btnReturnHome = CreateStyledButton("🏠 RETURN HOME", new Color(180, 50, 40), new Color(230, 90, 80), Color.White, VentureGame.Instance.SmallFont);
            _btnReturnHome.HorizontalAlignment = HorizontalAlignment.Right;
            _btnReturnHome.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "returnHome" });
            };
            Grid.SetColumn(_btnReturnHome, 0);
            row2Grid.Widgets.Add(_btnReturnHome);

            // Player Card
            var playerCardContent = new VerticalStackPanel
            {
                Spacing = 4,
                Padding = new Thickness(6),
                Background = new SolidBrush(new Color(25, 22, 22, 240)),
                Width = 170,
                Height = 200
            };

            _lblPlayerName = new Label
            {
                Text = "Bobby",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.White,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            playerCardContent.Widgets.Add(_lblPlayerName);

            _playerImg = new Image
            {
                Width = 140,
                Height = 90,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            playerCardContent.Widgets.Add(_playerImg);

            _playerHpBarContainer = new Panel();
            playerCardContent.Widgets.Add(_playerHpBarContainer);

            _playerShieldBarContainer = new Panel();
            playerCardContent.Widgets.Add(_playerShieldBarContainer);

            _playerApBarContainer = new Panel();
            playerCardContent.Widgets.Add(_playerApBarContainer);

            var playerCardBorder = new Panel
            {
                BorderThickness = new Thickness(2),
                Border = new SolidBrush(new Color(230, 180, 40)), // gold border
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            playerCardBorder.Widgets.Add(playerCardContent);
            Grid.SetColumn(playerCardBorder, 1);
            row2Grid.Widgets.Add(playerCardBorder);

            // Venture Deeper button (orange-gold styled)
            _btnVentureDeeper = CreateStyledButton("VENTURE DEEPER ⚔️", new Color(210, 150, 30), new Color(255, 190, 70), Color.Black, VentureGame.Instance.SmallFont);
            _btnVentureDeeper.HorizontalAlignment = HorizontalAlignment.Left;
            _btnVentureDeeper.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "ventureDeeper" });
            };
            Grid.SetColumn(_btnVentureDeeper, 2);
            row2Grid.Widgets.Add(_btnVentureDeeper);

            Grid.SetRow(row2Grid, 2);
            grid.Widgets.Add(row2Grid);

            // --- ROW 3: ACTION TRAY ---
            var actionTrayGrid = new Grid { ColumnSpacing = 15 };
            actionTrayGrid.ColumnsProportions.Add(new Proportion(ProportionType.Fill)); // Slots Area
            actionTrayGrid.ColumnsProportions.Add(new Proportion(ProportionType.Auto)); // End Turn Button

            var slotsPanel = new VerticalStackPanel { Spacing = 8 };
            
            _gearRow = new HorizontalStackPanel { Spacing = 8 };
            _spellsRow = new HorizontalStackPanel { Spacing = 8 };
            
            slotsPanel.Widgets.Add(_gearRow);
            slotsPanel.Widgets.Add(_spellsRow);
            
            Grid.SetColumn(slotsPanel, 0);
            actionTrayGrid.Widgets.Add(slotsPanel);

            // End Turn Button
            _btnEndTurn = new Button
            {
                Width = 130,
                Height = 118,
                Background = new SolidBrush(new Color(180, 50, 40)),
                BorderThickness = new Thickness(2),
                Border = new SolidBrush(new Color(230, 90, 80)),
                VerticalAlignment = VerticalAlignment.Center
            };
            var lblEndTurn = new Label
            {
                Text = "END TURN",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            _btnEndTurn.Content = lblEndTurn;
            _btnEndTurn.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "endTurn" });
                _btnEndTurn.Enabled = false;
            };
            Grid.SetColumn(_btnEndTurn, 1);
            actionTrayGrid.Widgets.Add(_btnEndTurn);

            Grid.SetRow(actionTrayGrid, 3);
            grid.Widgets.Add(actionTrayGrid);

            // --- ROW 4: LOGS & CHAT ---
            var logsContainerGrid = new Grid { RowSpacing = 5 };
            logsContainerGrid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Tabs
            logsContainerGrid.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Logs Content
            logsContainerGrid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Chat Input

            // Tabs Row
            var tabsPanel = new HorizontalStackPanel { Spacing = 8 };
            var btnAll = new Button
            {
                Padding = new Thickness(10, 4),
                Background = new SolidBrush(new Color(15, 15, 15)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(Color.Gold)
            };
            btnAll.Content = new Label { Text = "ALL", Font = VentureGame.Instance.SmallFont, TextColor = Color.White };
            
            var btnCombat = new Button
            {
                Padding = new Thickness(10, 4),
                Background = new SolidBrush(new Color(30, 30, 30)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(Color.Gray)
            };
            btnCombat.Content = new Label { Text = "COMBAT", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gray };

            var btnChat = new Button
            {
                Padding = new Thickness(10, 4),
                Background = new SolidBrush(new Color(30, 30, 30)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(Color.Gray)
            };
            btnChat.Content = new Label { Text = "CHAT", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gray };

            tabsPanel.Widgets.Add(btnAll);
            tabsPanel.Widgets.Add(btnCombat);
            tabsPanel.Widgets.Add(btnChat);
            Grid.SetRow(tabsPanel, 0);
            logsContainerGrid.Widgets.Add(tabsPanel);

            // Logs Scroll area
            _logPanel = new VerticalStackPanel { Spacing = 4, Padding = new Thickness(8) };
            _logScroll = new ScrollViewer
            {
                Content = _logPanel,
                Background = new SolidBrush(new Color(15, 18, 22, 200)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(50, 55, 65)),
                Height = 85
            };
            Grid.SetRow(_logScroll, 1);
            logsContainerGrid.Widgets.Add(_logScroll);

            // Chat input row
            var chatInputRow = new Grid { ColumnSpacing = 10 };
            chatInputRow.ColumnsProportions.Add(new Proportion(ProportionType.Fill));
            chatInputRow.ColumnsProportions.Add(new Proportion(ProportionType.Auto));

            _chatInput = new TextBox
            {
                Font = VentureGame.Instance.SmallFont,
                Background = new SolidBrush(new Color(35, 40, 48)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(70, 75, 85)),
                TextColor = Color.White
            };
            _chatInput.KeyDown += async (s, e) =>
            {
                if (e.Data == Keys.Enter)
                {
                    await SendZoneMessage();
                }
            };

            var btnSend = new Button
            {
                Padding = new Thickness(15, 5),
                Background = new SolidBrush(new Color(55, 95, 185)), // blue send button
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(85, 125, 215))
            };
            btnSend.Content = new Label { Text = "SEND", Font = VentureGame.Instance.SmallFont, TextColor = Color.White };
            btnSend.Click += async (s, e) =>
            {
                await SendZoneMessage();
            };

            Grid.SetColumn(_chatInput, 0);
            Grid.SetColumn(btnSend, 1);
            chatInputRow.Widgets.Add(_chatInput);
            chatInputRow.Widgets.Add(btnSend);

            Grid.SetRow(chatInputRow, 2);
            logsContainerGrid.Widgets.Add(chatInputRow);

            Grid.SetRow(logsContainerGrid, 4);
            grid.Widgets.Add(logsContainerGrid);

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

        private void RefreshHUD()
        {
            var charState = VentureGame.Instance.CharacterState;
            _lblAp.Text = $"⚡ AP: {charState?.ActionPoints ?? 0}";
            _btnEndTurn.Enabled = true;

            _hudHpBarContainer.Widgets.Clear();
            var hpBar = CreateCustomProgressBar(
                charState?.Health ?? 0,
                charState?.MaxHealth ?? 10,
                new Color(200, 50, 40),
                $"{(charState?.Health ?? 0)} / {(charState?.MaxHealth ?? 10)}",
                VentureGame.Instance.MainFont
            );
            _hudHpBarContainer.Widgets.Add(hpBar);

            // Update player card stats
            _lblPlayerName.Text = charState?.CharacterName ?? "Bobby";
            var avatarTex = ResolvePlayerAvatar(charState);
            if (avatarTex != null)
            {
                _playerImg.Renderable = new TextureRegion(avatarTex);
            }

            _playerHpBarContainer.Widgets.Clear();
            var playerHp = CreateCustomProgressBar(
                charState?.Health ?? 0,
                charState?.MaxHealth ?? 10,
                new Color(200, 50, 40),
                $"{(charState?.Health ?? 0)}/{(charState?.MaxHealth ?? 10)}",
                VentureGame.Instance.SmallFont
            );
            _playerHpBarContainer.Widgets.Add(playerHp);

            _playerShieldBarContainer.Widgets.Clear();
            int shieldVal = charState?.Shield ?? 0;
            var playerShield = CreateCustomProgressBar(
                shieldVal,
                charState?.MaxHealth ?? 10,
                new Color(120, 50, 160),
                $"Shield: {shieldVal}",
                VentureGame.Instance.SmallFont
            );
            _playerShieldBarContainer.Widgets.Add(playerShield);

            _playerApBarContainer.Widgets.Clear();
            int apVal = charState?.ActionPoints ?? 0;
            var playerAp = CreateCustomProgressBar(
                apVal,
                3, // max AP is typically 3
                new Color(210, 170, 30),
                $"AP: {apVal}/3",
                VentureGame.Instance.SmallFont
            );
            _playerApBarContainer.Widgets.Add(playerAp);
        }

        private void RefreshBoard()
        {
            _boardContainer.Widgets.Clear();
            var advState = VentureGame.Instance.AdventureState;
            if (advState?.Cards == null) return;

            for (int i = 0; i < advState.Cards.Count; i++)
            {
                var card = advState.Cards[i];
                int cardIndex = i;

                if (card == null)
                {
                    // Empty placeholder card slot (dashed-like border, transparent background)
                    var emptyCard = new Panel
                    {
                        Width = 150,
                        Height = 170,
                        BorderThickness = new Thickness(2),
                        Border = new SolidBrush(new Color(60, 60, 60)),
                        Background = new SolidBrush(new Color(20, 20, 20, 100))
                    };
                    _boardContainer.Widgets.Add(emptyCard);
                    continue;
                }

                // Build active card
                var cardContent = new VerticalStackPanel
                {
                    Spacing = 4,
                    Padding = new Thickness(6)
                };

                // Name (Gold/Orange text)
                var lblName = new Label
                {
                    Text = card.Name,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.Gold,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                cardContent.Widgets.Add(lblName);

                // Card Image
                var cardImg = new Image
                {
                    Width = 130,
                    Height = 90,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
                var tex = ResolveCardTexture(card);
                if (tex != null)
                {
                    cardImg.Renderable = new TextureRegion(tex);
                }
                else
                {
                    // Fallback emoji
                    var lblEmoji = new Label
                    {
                        Text = card.Icon ?? "❓",
                        Font = VentureGame.Instance.MainFont,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    cardContent.Widgets.Add(lblEmoji);
                }
                cardContent.Widgets.Add(cardImg);

                // Progress bar for Card Health
                if (card.Health > 0)
                {
                    var hpBarCard = CreateCustomProgressBar(
                        card.Health,
                        card.MaxHealth,
                        new Color(180, 40, 40),
                        $"{card.Health}/{card.MaxHealth}",
                        VentureGame.Instance.SmallFont
                    );
                    cardContent.Widgets.Add(hpBarCard);
                }
                else
                {
                    // Spacer to keep layout identical
                    var spacer = new Panel { Height = 24 };
                    cardContent.Widgets.Add(spacer);
                }

                // Build Button for card
                var btnCard = new Button
                {
                    Content = cardContent,
                    Padding = new Thickness(2),
                    Background = new SolidBrush(new Color(30, 26, 26, 220)),
                    BorderThickness = new Thickness(2),
                    Border = new SolidBrush(new Color(230, 180, 40)), // golden/yellow border
                    Width = 150,
                    Height = 170
                };

                btnCard.Click += async (s, e) =>
                {
                    await PerformCardInteraction(cardIndex, card);
                };

                _boardContainer.Widgets.Add(btnCard);
            }

            // Add Deck Counter
            int deckSize = advState?.ZoneDeck?.Count ?? 0;
            if (deckSize > 0)
            {
                var deckContainer = new Panel
                {
                    Width = 50,
                    Height = 60,
                    Background = new SolidBrush(Color.Black),
                    BorderThickness = new Thickness(3),
                    Border = new SolidBrush(Color.White),
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(10, 0, 0, 0)
                };
                var lblDeckCount = new Label
                {
                    Text = deckSize.ToString(),
                    Font = VentureGame.Instance.MainFont,
                    TextColor = Color.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
                deckContainer.Widgets.Add(lblDeckCount);
                _boardContainer.Widgets.Add(deckContainer);
            }
        }

        private void RefreshActionBar()
        {
            _gearRow.Widgets.Clear();
            _spellsRow.Widgets.Clear();
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            // --- GEAR ROW ---
            // 👤 Character
            var btnChar = CreateSlotButton("👤 Info", null, null, false, () => {
                AppendLogMessage("System", "Character sheet preview is not available in combat.", Color.Gray);
            });
            _gearRow.Widgets.Add(btnChar);

            // 🎒 Inventory
            var btnBag = CreateSlotButton("🎒 Bag", null, null, false, () => {
                AppendLogMessage("System", "Inventory management is not available in combat.", Color.Gray);
            });
            _gearRow.Widgets.Add(btnBag);

            // 📜 Quests
            var btnQuest = CreateSlotButton("📜 Quest", null, null, false, () => {
                AppendLogMessage("System", "Quest log is not available in combat.", Color.Gray);
            });
            _gearRow.Widgets.Add(btnQuest);

            // Weapon Slot
            string weaponName = charState.Equipment?.MainHand?.Name;
            if (!string.IsNullOrEmpty(weaponName))
            {
                var btnWeapon = CreateSlotButton(
                    "⚔️ " + weaponName,
                    null,
                    "⚡ 1  ⌛ 1",
                    _weaponAttackSelected,
                    () => {
                        _weaponAttackSelected = !_weaponAttackSelected;
                        _selectedSpellIndex = null;
                        RefreshActionBar();
                    }
                );
                _gearRow.Widgets.Add(btnWeapon);
            }
            else
            {
                // Default Weapon slot - Punch
                var btnWeapon = CreateSlotButton(
                    "👊 Punch",
                    null,
                    "⚡ 1  ⌛ 1",
                    _weaponAttackSelected,
                    () => {
                        _weaponAttackSelected = !_weaponAttackSelected;
                        _selectedSpellIndex = null;
                        RefreshActionBar();
                    }
                );
                _gearRow.Widgets.Add(btnWeapon);
            }

            // Empty Slots for other gear
            string[] gearLabels = { "Off Hand", "Helmet", "Armor", "Boots", "Accessory" };
            for (int i = 0; i < gearLabels.Length; i++)
            {
                _gearRow.Widgets.Add(CreateEmptySlot(gearLabels[i]));
            }

            // --- SPELLS ROW ---
            // Populate Spell slots from spellbook
            int spellSlotCount = 0;
            if (charState.Spellbook != null)
            {
                for (int i = 0; i < charState.Spellbook.Count; i++)
                {
                    var spell = charState.Spellbook[i];
                    int spellIndex = i;
                    bool isSpellSelected = _selectedSpellIndex == spellIndex;

                    string spellIcon = spell.Icon ?? "🔮";
                    var btnSpell = CreateSlotButton(
                        $"{spellIcon} {spell.Name}",
                        null,
                        $"⚡ {spell.Cost}  ⌛ {spell.Cooldown}",
                        isSpellSelected,
                        () => {
                            if (isSpellSelected)
                            {
                                _selectedSpellIndex = null;
                            }
                            else
                            {
                                _selectedSpellIndex = spellIndex;
                                _weaponAttackSelected = false;
                            }
                            RefreshActionBar();
                        }
                    );
                    _spellsRow.Widgets.Add(btnSpell);
                    spellSlotCount++;
                }
            }

            // Fill remaining spell slots up to 5
            for (int i = spellSlotCount; i < 5; i++)
            {
                _spellsRow.Widgets.Add(CreateEmptySlot($"Spell {i + 1}"));
            }
        }

        private async System.Threading.Tasks.Task PerformCardInteraction(int cardIndex, CardState card)
        {
            if (_weaponAttackSelected)
            {
                var payload = new { weaponSlot = "mainHand", targetIndex = cardIndex };
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "weaponAttack", payload });
                _weaponAttackSelected = false;
                RefreshActionBar();
                return;
            }

            if (_selectedSpellIndex.HasValue)
            {
                var payload = new { spellIndex = _selectedSpellIndex.Value, targetIndex = cardIndex.ToString() };
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "castSpell", payload });
                _selectedSpellIndex = null;
                RefreshActionBar();
                return;
            }

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
            VentureGame.Instance.ScreenManager.ChangeScreen(new MainHubScreen());
        }

        // --- UI HELPERS ---
        private Widget CreateCustomProgressBar(int value, int maxValue, Color barColor, string text, SpriteFontBase font)
        {
            double percent = maxValue > 0 ? (double)value / maxValue : 0.0;
            percent = Math.Max(0.0, Math.Min(1.0, percent));

            var container = new Panel
            {
                Height = 22,
                Background = new SolidBrush(new Color(20, 20, 20, 200)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(60, 60, 60))
            };

            var progressGrid = new Grid();
            progressGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, Math.Max(0.001f, (float)percent)));
            progressGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, Math.Max(0.001f, (float)(1.0 - percent))));

            if (percent > 0)
            {
                var fill = new Panel
                {
                    Background = new SolidBrush(barColor)
                };
                Grid.SetColumn(fill, 0);
                progressGrid.Widgets.Add(fill);
            }

            container.Widgets.Add(progressGrid);

            var label = new Label
            {
                Text = text,
                Font = font,
                TextColor = Color.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            container.Widgets.Add(label);

            return container;
        }

        private Button CreateStyledButton(string text, Color bgColor, Color borderColor, Color textColor, SpriteFontBase font)
        {
            var btn = new Button
            {
                Padding = new Thickness(14, 8),
                Background = new SolidBrush(bgColor),
                BorderThickness = new Thickness(2),
                Border = new SolidBrush(borderColor),
                VerticalAlignment = VerticalAlignment.Center
            };
            var lbl = new Label
            {
                Text = text,
                Font = font,
                TextColor = textColor,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            btn.Content = lbl;
            return btn;
        }

        private Button CreateSlotButton(string title, string subtitle, string costInfo, bool isSelected, Action onClick)
        {
            var btn = new Button
            {
                Width = 92,
                Height = 55,
                Padding = new Thickness(2),
                Background = isSelected ? new SolidBrush(new Color(60, 50, 30)) : new SolidBrush(new Color(25, 28, 32)),
                BorderThickness = new Thickness(1),
                Border = isSelected ? new SolidBrush(Color.Gold) : new SolidBrush(new Color(80, 80, 80))
            };

            var panel = new VerticalStackPanel { Spacing = 2 };

            var lblTitle = new Label
            {
                Text = title,
                Font = VentureGame.Instance.SmallFont,
                TextColor = isSelected ? Color.Gold : Color.LightGray,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            panel.Widgets.Add(lblTitle);

            if (!string.IsNullOrEmpty(subtitle))
            {
                var lblSub = new Label
                {
                    Text = subtitle,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.Gray,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                panel.Widgets.Add(lblSub);
            }

            if (!string.IsNullOrEmpty(costInfo))
            {
                var lblCost = new Label
                {
                    Text = costInfo,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.Yellow,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                panel.Widgets.Add(lblCost);
            }

            btn.Content = panel;
            btn.Click += (s, e) => onClick();
            return btn;
        }

        private Button CreateEmptySlot(string text)
        {
            var btn = new Button
            {
                Width = 92,
                Height = 55,
                Padding = new Thickness(2),
                Background = new SolidBrush(new Color(20, 20, 20, 100)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(60, 60, 60)),
                Enabled = false
            };
            var lbl = new Label
            {
                Text = text,
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.DimGray,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            btn.Content = lbl;
            return btn;
        }

        private string GetBackgroundPath(string zone)
        {
            if (string.IsNullOrEmpty(zone)) return "assets/backgrounds/farmlands.png";
            string lowerZone = zone.ToLowerInvariant();
            if (lowerZone.Contains("farmland")) return "assets/backgrounds/farmlands.png";
            if (lowerZone.Contains("goblin")) return "assets/backgrounds/goblinCaves.png";
            if (lowerZone.Contains("sewer")) return "assets/backgrounds/sewers.png";
            if (lowerZone.Contains("town")) return "assets/backgrounds/town.png";
            if (lowerZone.Contains("arena")) return "assets/backgrounds/arena.png";
            if (lowerZone.Contains("blight")) return "assets/backgrounds/blighted_wastes.png";
            if (lowerZone.Contains("duel")) return "assets/backgrounds/duel.png";
            return "assets/backgrounds/farmlands.png";
        }

        private Texture2D ResolvePlayerAvatar(CharacterState character)
        {
            if (character == null) return null;
            string path = character.CharacterIcon;
            if (!string.IsNullOrEmpty(path))
            {
                if (path.StartsWith("/")) path = path.Substring(1);
                var tex = VentureGame.Instance.LoadTexture(path);
                if (tex != null) return tex;
            }
            return VentureGame.Instance.LoadTexture("assets/avatars/avatar-male-1.jpg");
        }

        private Texture2D ResolveCardTexture(CardState card)
        {
            if (card == null) return null;

            // 1. Try ImageUrl
            if (!string.IsNullOrEmpty(card.ImageUrl))
            {
                string path = card.ImageUrl;
                if (path.StartsWith("/")) path = path.Substring(1);
                var tex = VentureGame.Instance.LoadTexture(path);
                if (tex != null) return tex;
            }

            // 2. Fallback to mapping by name
            string name = card.Name?.ToLowerInvariant() ?? "";
            string resolvedPath = null;
            if (name.Contains("wife")) resolvedPath = "assets/farmlands-farmerswife.jpg";
            else if (name.Contains("farmer")) resolvedPath = "assets/farmlands-farmer.jpg";
            else if (name.Contains("compost")) resolvedPath = "assets/compost_bin.jpg";
            else if (name.Contains("rooster")) resolvedPath = "assets/farmlands-angryrooster.jpg";
            else if (name.Contains("chicken")) resolvedPath = "assets/farmlands-chicken.jpg";
            else if (name.Contains("coop")) resolvedPath = "assets/farmlands-chickencoop.jpg";
            else if (name.Contains("cow")) resolvedPath = "assets/farmlands-cow.jpg";
            else if (name.Contains("crops")) resolvedPath = "assets/farmlands-crops.jpg";
            else if (name.Contains("pig")) resolvedPath = "assets/farmlands-pig.jpg";
            else if (name.Contains("bull")) resolvedPath = "assets/farmlands-ragingbull.jpg";
            else if (name.Contains("river")) resolvedPath = "assets/farmlands-river.jpg";
            else if (name.Contains("chest")) resolvedPath = "assets/farmlands-treasurechest.jpg";
            else if (name.Contains("tree")) resolvedPath = "assets/farmlands-tree.jpg";
            else if (name.Contains("iron")) resolvedPath = "assets/farmlands-ironnode.jpg";
            else if (name.Contains("revolter")) resolvedPath = "assets/farmhand_revolter.jpg";
            else if (name.Contains("loyal")) resolvedPath = "assets/loyal_farmhand.jpg";

            // sewers
            else if (name.Contains("rat king")) resolvedPath = "assets/rat-king.jpg";
            else if (name.Contains("sewer rat")) resolvedPath = "assets/sewer-rat.jpg";
            else if (name.Contains("plague rat")) resolvedPath = "assets/plague-rat.jpg";

            // goblin caves
            else if (name.Contains("goblin king")) resolvedPath = "assets/goblincaves-king.jpg";
            else if (name.Contains("shaman")) resolvedPath = "assets/goblincaves-shaman.jpg";
            else if (name.Contains("archer")) resolvedPath = "assets/goblincaves-archer.jpg";
            else if (name.Contains("warrior")) resolvedPath = "assets/goblincaves-warrior.jpg";
            else if (name.Contains("boulder")) resolvedPath = "assets/goblincaves-boulder.jpg";

            if (resolvedPath != null)
            {
                var tex = VentureGame.Instance.LoadTexture(resolvedPath);
                if (tex != null) return tex;
            }

            return null;
        }

        public void Update(GameTime gameTime)
        {
        }

        public void Draw(SpriteBatch spriteBatch, GameTime gameTime)
        {
            var advState = VentureGame.Instance.AdventureState;
            string zone = advState?.Zone;
            string bgPath = GetBackgroundPath(zone);
            var bgTexture = VentureGame.Instance.LoadTexture(bgPath);
            if (bgTexture != null)
            {
                var viewport = VentureGame.Instance.GraphicsDevice.Viewport;
                var screenBounds = new Rectangle(0, 0, viewport.Width, viewport.Height);
                spriteBatch.Draw(bgTexture, screenBounds, Color.White);
            }
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
