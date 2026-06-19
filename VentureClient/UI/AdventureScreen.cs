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
        private Dialog _activeDialogueDialog = null;

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
            var hudGrid = new Grid
            {
                ColumnSpacing = 15,
                HorizontalAlignment = HorizontalAlignment.Center,
                Width = 900
            };
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
            row2Grid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1.0f)); // Return Home (Column 0: 33.3%)
            row2Grid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1.0f)); // Player Card (Column 1: 33.3%)
            row2Grid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1.0f)); // Venture Deeper (Column 2: 33.3%)

            // Return Home button (rust-red styled)
            _btnReturnHome = CreateStyledButton("🏠 RETURN HOME", new Color(180, 50, 40), new Color(230, 90, 80), Color.White, VentureGame.Instance.SmallFont);
            _btnReturnHome.HorizontalAlignment = HorizontalAlignment.Right;
            _btnReturnHome.Margin = new Thickness(0, 0, 25, 0);
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
            _btnVentureDeeper.Margin = new Thickness(25, 0, 0, 0);
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
            var logsContainerGrid = new Grid { RowSpacing = 5, Padding = new Thickness(10, 5, 10, 5) };
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
            VentureGame.Instance.Network.OnShowDialogue += HandleShowDialogue;
            VentureGame.Instance.Network.OnHideDialogue += HandleHideDialogue;

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
            if (advState == null) return;

            if (advState.Zone == "training")
            {
                RefreshTrainingBoard();
                return;
            }

            if (advState.Cards == null) return;

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

        private void RefreshTrainingBoard()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            var trainingGrid = new Grid { RowSpacing = 10 };
            trainingGrid.RowsProportions.Add(new Proportion(ProportionType.Auto));
            trainingGrid.RowsProportions.Add(new Proportion(ProportionType.Auto));
            trainingGrid.RowsProportions.Add(new Proportion(ProportionType.Auto));

            int qp = charState.QuestPoints;
            int totalQp = charState.TotalQuestPointsEarned;
            int trainingCost = charState.SpellsLearnedFromTraining + 1;
            bool canAfford = qp >= trainingCost;

            var headerPanel = new VerticalStackPanel
            {
                Spacing = 4,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            headerPanel.Widgets.Add(new Label
            {
                Text = "🏛️ Training Grounds",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Gold,
                HorizontalAlignment = HorizontalAlignment.Center
            });
            headerPanel.Widgets.Add(new Label
            {
                Text = $"Current QP: {qp} / {totalQp}   |   Next Spell Cost: {trainingCost} QP",
                Font = VentureGame.Instance.SmallFont,
                TextColor = canAfford ? Color.LightGreen : Color.LightPink,
                HorizontalAlignment = HorizontalAlignment.Center
            });
            Grid.SetRow(headerPanel, 0);
            trainingGrid.Widgets.Add(headerPanel);

            var cardsRow = new HorizontalStackPanel { Spacing = 15, HorizontalAlignment = HorizontalAlignment.Center };
            var offerings = charState.TrainingOfferings;
            if (offerings != null && offerings.Count > 0)
            {
                foreach (var spellName in offerings)
                {
                    var spell = VentureGame.Instance.AllSpells.Find(s => s.Name == spellName);
                    if (spell == null) continue;

                    var cardContent = new VerticalStackPanel { Spacing = 4, Padding = new Thickness(6), Width = 150 };

                    cardContent.Widgets.Add(new Label
                    {
                        Text = spell.Name,
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.Gold,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });

                    cardContent.Widgets.Add(new Label
                    {
                        Text = spell.Icon ?? "✨",
                        Font = VentureGame.Instance.MainFont,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });

                    cardContent.Widgets.Add(new Label
                    {
                        Text = $"School: {spell.School}",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.LightGray,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });

                    cardContent.Widgets.Add(new Label
                    {
                        Text = spell.Description ?? "",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.White,
                        Wrap = true,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });

                    var btnLearn = CreateStyledButton($"Learn ({trainingCost} QP)",
                        canAfford ? new Color(50, 150, 50) : new Color(60, 60, 60),
                        canAfford ? Color.Green : Color.DarkGray,
                        Color.White,
                        VentureGame.Instance.SmallFont);
                    btnLearn.Enabled = canAfford;

                    btnLearn.Click += (s, e) =>
                    {
                        var confirmDialog = new Dialog
                        {
                            Title = "Confirm Spell Learning",
                            Width = 320,
                            Height = 150
                        };
                        var layout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };
                        layout.Widgets.Add(new Label { Text = $"Learn {spell.Icon} {spell.Name} for {trainingCost} QP?", Font = VentureGame.Instance.SmallFont, TextColor = Color.White, Wrap = true });
                        var btnRow = new HorizontalStackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Center };

                        var btnYes = MyraExtensions.CreateButton("Yes", VentureGame.Instance.SmallFont);
                        btnYes.Click += async (s2, e2) =>
                        {
                            await VentureGame.Instance.Network.EmitPartyAction(new { type = "learnTrainingSpell", payload = new { spellName = spell.Name } });
                            confirmDialog.Close();
                        };

                        var btnNo = MyraExtensions.CreateButton("No", VentureGame.Instance.SmallFont);
                        btnNo.Click += (s2, e2) => confirmDialog.Close();

                        btnRow.Widgets.Add(btnYes);
                        btnRow.Widgets.Add(btnNo);
                        layout.Widgets.Add(btnRow);
                        confirmDialog.Content = layout;
                        confirmDialog.ShowModal(VentureGame.Instance.Desktop);
                    };

                    cardContent.Widgets.Add(btnLearn);

                    var spellCardBorder = new Panel
                    {
                        BorderThickness = new Thickness(2),
                        Border = new SolidBrush(Color.Gold),
                        Background = new SolidBrush(new Color(25, 22, 22, 240)),
                        Padding = new Thickness(2)
                    };
                    spellCardBorder.Widgets.Add(cardContent);
                    cardsRow.Widgets.Add(spellCardBorder);
                }
            }
            else
            {
                cardsRow.Widgets.Add(new Label { Text = "No spells available.", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gray });
            }
            Grid.SetRow(cardsRow, 1);
            trainingGrid.Widgets.Add(cardsRow);

            int refreshCost = 100 * (int)Math.Pow(2, charState.TrainingRefreshCount);
            bool canAffordRefresh = charState.Gold >= refreshCost;

            var refreshPanel = new HorizontalStackPanel
            {
                Spacing = 10,
                HorizontalAlignment = HorizontalAlignment.Center,
                Padding = new Thickness(0, 10, 0, 0)
            };

            var btnRefresh = CreateStyledButton($"Refresh Spells ({refreshCost} Gold)",
                canAffordRefresh ? new Color(50, 100, 150) : new Color(60, 60, 60),
                canAffordRefresh ? Color.Blue : Color.DarkGray,
                Color.White,
                VentureGame.Instance.SmallFont);
            btnRefresh.Enabled = canAffordRefresh;
            btnRefresh.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPartyAction(new { type = "refreshTrainingSpells" });
            };
            refreshPanel.Widgets.Add(btnRefresh);

            Grid.SetRow(refreshPanel, 2);
            trainingGrid.Widgets.Add(refreshPanel);

            _boardContainer.Widgets.Add(trainingGrid);
        }

        private void RefreshActionBar()
        {
            _gearRow.Widgets.Clear();
            _spellsRow.Widgets.Clear();
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            // --- GEAR ROW ---
            // 👤 Character (circular)
            var btnChar = CreateCircularButton("👤");
            btnChar.Click += (s, e) => {
                OpenCharacterSheetDialog();
            };
            _gearRow.Widgets.Add(btnChar);

            // 🎒 Inventory (circular)
            var btnBag = CreateCircularButton("🎒");
            btnBag.Click += (s, e) => {
                OpenBackpackDialog();
            };
            _gearRow.Widgets.Add(btnBag);

            // 📜 Quests (circular)
            var btnQuest = CreateCircularButton("📜");
            btnQuest.Click += (s, e) => {
                OpenQuestLogDialog();
            };
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
            // Add spacer of width 159 to align spells under weapon slot
            var spellsSpacer = new Panel { Width = 159 };
            _spellsRow.Widgets.Add(spellsSpacer);

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

        private Button CreateCircularButton(string iconText)
        {
            var btn = new Button
            {
                Width = 45,
                Height = 45,
                Padding = new Thickness(0),
                Background = new SolidBrush(new Color(40, 45, 52)),
                BorderThickness = new Thickness(2),
                Border = new SolidBrush(new Color(100, 110, 120)),
                VerticalAlignment = VerticalAlignment.Center
            };
            var lbl = new Label
            {
                Text = iconText,
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.White,
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
                HorizontalAlignment = HorizontalAlignment.Center,
                Wrap = true
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

        private void OpenCharacterSheetDialog()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            var dialog = new Dialog
            {
                Title = "Character Sheet",
                Width = 420,
                Height = 450
            };

            var mainLayout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };

            // 1. Stats and Attributes
            var statsGrid = new Grid { ColumnSpacing = 15, RowSpacing = 4 };
            statsGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));
            statsGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            var col1 = new VerticalStackPanel { Spacing = 4 };
            col1.Widgets.Add(new Label { Text = "📊 Attributes", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });
            col1.Widgets.Add(new Label { Text = $"❤️ Max HP: {charState.MaxHealth}", Font = VentureGame.Instance.SmallFont });
            col1.Widgets.Add(new Label { Text = $"💪 Strength: {charState.Strength}", Font = VentureGame.Instance.SmallFont });
            col1.Widgets.Add(new Label { Text = $"🏃 Agility: {charState.Agility}", Font = VentureGame.Instance.SmallFont });
            col1.Widgets.Add(new Label { Text = $"🧠 Wisdom: {charState.Wisdom}", Font = VentureGame.Instance.SmallFont });
            col1.Widgets.Add(new Label { Text = $"🛡️ Defense: {charState.Defense}", Font = VentureGame.Instance.SmallFont });
            col1.Widgets.Add(new Label { Text = $"🍀 Luck: {charState.Luck}", Font = VentureGame.Instance.SmallFont });

            var col2 = new VerticalStackPanel { Spacing = 4 };
            col2.Widgets.Add(new Label { Text = "🛡️ Resistances", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });
            col2.Widgets.Add(new Label { Text = $"Physical: {charState.PhysicalResistance}", Font = VentureGame.Instance.SmallFont });
            col2.Widgets.Add(new Label { Text = $"Magical: {charState.MagicalResistance}", Font = VentureGame.Instance.SmallFont });
            col2.Widgets.Add(new Label { Text = $"Fire: {charState.FireResistance}", Font = VentureGame.Instance.SmallFont });
            col2.Widgets.Add(new Label { Text = $"Frost: {charState.FrostResistance}", Font = VentureGame.Instance.SmallFont });
            col2.Widgets.Add(new Label { Text = $"Nature: {charState.NatureResistance}", Font = VentureGame.Instance.SmallFont });
            col2.Widgets.Add(new Label { Text = $"Arcane: {charState.ArcaneResistance}", Font = VentureGame.Instance.SmallFont });
            col2.Widgets.Add(new Label { Text = $"Holy: {charState.HolyResistance}", Font = VentureGame.Instance.SmallFont });

            Grid.SetColumn(col1, 0);
            Grid.SetColumn(col2, 1);
            statsGrid.Widgets.Add(col1);
            statsGrid.Widgets.Add(col2);
            mainLayout.Widgets.Add(statsGrid);

            var separator = new Panel
            {
                Height = 1,
                Background = new SolidBrush(new Color(60, 60, 60)),
                Margin = new Thickness(0, 5, 0, 5)
            };
            mainLayout.Widgets.Add(separator);

            // 2. Equipment
            mainLayout.Widgets.Add(new Label { Text = "🛡️ Equipment", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });

            var eqPanel = new VerticalStackPanel { Spacing = 6 };
            var slots = new Dictionary<string, string>
            {
                { "mainHand", "Main Hand" },
                { "offHand", "Off Hand" },
                { "helmet", "Helmet" },
                { "armor", "Armor" },
                { "boots", "Boots" },
                { "accessory", "Accessory" }
            };

            foreach (var kvp in slots)
            {
                var slotKey = kvp.Key;
                var slotName = kvp.Value;

                ItemData item = null;
                if (slotKey == "mainHand") item = charState.Equipment?.MainHand;
                else if (slotKey == "offHand") item = charState.Equipment?.OffHand;
                else if (slotKey == "helmet") item = charState.Equipment?.Helmet;
                else if (slotKey == "armor") item = charState.Equipment?.Armor;
                else if (slotKey == "boots") item = charState.Equipment?.Boots;
                else if (slotKey == "accessory") item = charState.Equipment?.Accessory;

                if (item != null)
                {
                    var row = new Grid { ColumnSpacing = 10 };
                    row.ColumnsProportions.Add(new Proportion(ProportionType.Fill));
                    row.ColumnsProportions.Add(new Proportion(ProportionType.Auto));

                    var lblItem = new Label
                    {
                        Text = $"{item.Icon} {slotName}: {item.Name}",
                        Font = VentureGame.Instance.SmallFont,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    Grid.SetColumn(lblItem, 0);
                    row.Widgets.Add(lblItem);

                    var btnUnequip = new Button
                    {
                        Padding = new Thickness(8, 4),
                        Background = new SolidBrush(new Color(150, 40, 40))
                    };
                    btnUnequip.Content = new Label { Text = "Unequip", Font = VentureGame.Instance.SmallFont, TextColor = Color.White };
                    btnUnequip.Click += async (s, e) =>
                    {
                        await VentureGame.Instance.Network.EmitPlayerAction("unequipItem", new { slot = slotKey });
                        dialog.Close();
                        await System.Threading.Tasks.Task.Delay(150);
                        OpenCharacterSheetDialog();
                    };
                    Grid.SetColumn(btnUnequip, 1);
                    row.Widgets.Add(btnUnequip);

                    eqPanel.Widgets.Add(row);
                }
            }
            mainLayout.Widgets.Add(eqPanel);

            dialog.Content = mainLayout;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void OpenBackpackDialog()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            var dialog = new Dialog
            {
                Title = "Backpack",
                Width = 480,
                Height = 450
            };

            var mainLayout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };
            mainLayout.Widgets.Add(new Label { Text = "🎒 Inventory Items", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });

            var itemGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
            for (int i = 0; i < 4; i++) itemGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            int r = 0, c = 0;
            for (int idx = 0; idx < 28; idx++)
            {
                ItemData item = null;
                if (charState.Inventory != null && idx < charState.Inventory.Count)
                {
                    item = charState.Inventory[idx];
                }

                int itemIndex = idx;
                var buttonText = item != null ? $"{item.Icon} {item.Name}" : "[Empty]";

                var btn = new Button
                {
                    Width = 105,
                    Height = 45,
                    Padding = new Thickness(2),
                    Background = item != null ? new SolidBrush(new Color(30, 35, 45)) : new SolidBrush(new Color(20, 20, 20, 100)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(new Color(60, 60, 60))
                };

                var lbl = new Label
                {
                    Text = buttonText,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = item != null ? Color.White : Color.DimGray,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Wrap = true
                };
                btn.Content = lbl;

                if (item != null)
                {
                    btn.Click += (s, e) =>
                    {
                        OpenItemActionDialog(item, itemIndex, dialog);
                    };
                }

                Grid.SetRow(btn, r);
                Grid.SetColumn(btn, c);
                itemGrid.Widgets.Add(btn);

                c++;
                if (c >= 4)
                {
                    c = 0;
                    r++;
                }
            }

            mainLayout.Widgets.Add(itemGrid);
            dialog.Content = mainLayout;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void OpenItemActionDialog(ItemData item, int itemIndex, Dialog parentBackpackDialog)
        {
            var dialog = new Dialog
            {
                Title = $"{item.Icon} {item.Name}",
                Width = 300,
                Height = 220
            };

            var mainLayout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };

            var lblDesc = new Label
            {
                Text = item.Description ?? "No description available.",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.LightGray,
                Wrap = true
            };
            mainLayout.Widgets.Add(lblDesc);

            if (item.Slot != null && item.Slot.Count > 0)
            {
                mainLayout.Widgets.Add(new Label { Text = "Equip to slot:", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gold });

                var slotsLayout = new HorizontalStackPanel { Spacing = 8 };
                foreach (var slot in item.Slot)
                {
                    string targetSlot = slot;
                    var btnEquip = new Button
                    {
                        Padding = new Thickness(10, 5),
                        Background = new SolidBrush(new Color(50, 120, 50))
                    };
                    btnEquip.Content = new Label { Text = slot, Font = VentureGame.Instance.SmallFont, TextColor = Color.White };
                    btnEquip.Click += async (s, e) =>
                    {
                        await VentureGame.Instance.Network.EmitPlayerAction("equipItem", new { itemIndex, chosenSlot = targetSlot });
                        dialog.Close();
                        parentBackpackDialog.Close();
                        await System.Threading.Tasks.Task.Delay(150);
                        OpenBackpackDialog();
                    };
                    slotsLayout.Widgets.Add(btnEquip);
                }
                mainLayout.Widgets.Add(slotsLayout);
            }
            else
            {
                mainLayout.Widgets.Add(new Label { Text = "This item cannot be equipped.", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gray });
            }

            dialog.Content = mainLayout;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void OpenQuestLogDialog()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            var dialog = new Dialog
            {
                Title = "Quest Log",
                Width = 350,
                Height = 300
            };

            var mainLayout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };
            mainLayout.Widgets.Add(new Label { Text = "📜 Active Quests", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });

            var questList = new VerticalStackPanel { Spacing = 8 };
            if (charState.Quests != null && charState.Quests.Count > 0)
            {
                foreach (var quest in charState.Quests)
                {
                    var questPanel = new VerticalStackPanel
                    {
                        Spacing = 4,
                        Padding = new Thickness(6),
                        Background = new SolidBrush(new Color(25, 28, 32)),
                        BorderThickness = new Thickness(1),
                        Border = new SolidBrush(new Color(60, 60, 60))
                    };

                    string title = quest.Details?.Title ?? "Unknown Quest";
                    var lblQuestName = new Label
                    {
                        Text = title,
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.White
                    };
                    questPanel.Widgets.Add(lblQuestName);

                    int required = quest.Details?.Required ?? 1;
                    string target = quest.Details?.Target ?? "Objectives";
                    string progressText = $"Progress: {quest.Progress} / {required} {target}s defeated";
                    if (quest.Details?.TurnInItems != null && quest.Details.TurnInItems.Count > 0)
                    {
                        progressText = "Collect: ";
                        foreach (var item in quest.Details.TurnInItems)
                        {
                            progressText += $"{item.Key} ({item.Value}) ";
                        }
                    }

                    var lblQuestProgress = new Label
                    {
                        Text = $"{progressText} (Status: {quest.Status})",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.Yellow
                    };
                    questPanel.Widgets.Add(lblQuestProgress);

                    var btnAbandon = new Button
                    {
                        Padding = new Thickness(6, 2),
                        Background = new SolidBrush(new Color(150, 40, 40)),
                        HorizontalAlignment = HorizontalAlignment.Right
                    };
                    btnAbandon.Content = new Label { Text = "Abandon", Font = VentureGame.Instance.SmallFont, TextColor = Color.White };
                    string questId = quest.Details?.Id;
                    btnAbandon.Click += (s, e) =>
                    {
                        var confirm = new Dialog
                        {
                            Title = "Abandon Quest",
                            Width = 250,
                            Height = 120
                        };
                        var layout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };
                        layout.Widgets.Add(new Label { Text = "Abandon this quest?", Font = VentureGame.Instance.SmallFont });
                        var btnRow = new HorizontalStackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Center };
                        var btnYes = MyraExtensions.CreateButton("Yes", VentureGame.Instance.SmallFont);
                        btnYes.Click += async (s2, e2) =>
                        {
                            await VentureGame.Instance.Network.EmitPlayerAction("abandonQuest", new { questId = questId });
                            confirm.Close();
                            dialog.Close();
                            await System.Threading.Tasks.Task.Delay(150);
                            OpenQuestLogDialog();
                        };
                        var btnNo = MyraExtensions.CreateButton("No", VentureGame.Instance.SmallFont);
                        btnNo.Click += (s2, e2) => confirm.Close();
                        btnRow.Widgets.Add(btnYes);
                        btnRow.Widgets.Add(btnNo);
                        layout.Widgets.Add(btnRow);
                        confirm.Content = layout;
                        confirm.ShowModal(VentureGame.Instance.Desktop);
                    };
                    questPanel.Widgets.Add(btnAbandon);

                    questList.Widgets.Add(questPanel);
                }
            }
            else
            {
                questList.Widgets.Add(new Label { Text = "No active quests.", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gray });
            }

            var scroll = new ScrollViewer { Content = questList, Height = 200 };
            mainLayout.Widgets.Add(scroll);

            dialog.Content = mainLayout;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void HandleShowDialogue(string npcName, Newtonsoft.Json.Linq.JObject node, Newtonsoft.Json.Linq.JToken cardIndex)
        {
            HandleHideDialogue();

            if (node == null) return;

            var dialog = new Dialog
            {
                Title = npcName,
                Width = 400,
                Height = 350
            };
            _activeDialogueDialog = dialog;

            var mainLayout = new VerticalStackPanel { Spacing = 12, Padding = new Thickness(12) };

            mainLayout.Widgets.Add(new Label
            {
                Text = npcName,
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Gold,
                HorizontalAlignment = HorizontalAlignment.Center
            });

            string text = node["text"]?.ToString() ?? "Hello, traveler.";
            mainLayout.Widgets.Add(new Label
            {
                Text = text,
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.White,
                Wrap = true
            });

            var optionsStack = new VerticalStackPanel { Spacing = 8 };
            var options = node["options"] as Newtonsoft.Json.Linq.JArray;
            if (options != null)
            {
                foreach (var opt in options)
                {
                    var option = opt;
                    string optText = option["text"]?.ToString() ?? "";

                    var btnOpt = new Button
                    {
                        Padding = new Thickness(10, 6),
                        Background = new SolidBrush(new Color(40, 50, 65)),
                        BorderThickness = new Thickness(1),
                        Border = new SolidBrush(new Color(80, 95, 120))
                    };
                    btnOpt.Content = new Label
                    {
                        Text = optText,
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.White,
                        Wrap = true
                    };

                    btnOpt.Click += async (s, e) =>
                    {
                        string nextNode = option["next"]?.ToString();
                        string action = option["action"]?.ToString();

                        if (nextNode == "farewell" && string.IsNullOrEmpty(action))
                        {
                            HandleHideDialogue();
                        }
                        else
                        {
                            var payload = new
                            {
                                cardIndex = cardIndex,
                                choice = option
                            };
                            await VentureGame.Instance.Network.EmitPartyAction(new { type = "dialogueChoice", payload });
                            dialog.Close();
                        }
                    };
                    optionsStack.Widgets.Add(btnOpt);
                }
            }

            var btnLeave = new Button
            {
                Padding = new Thickness(10, 6),
                Background = new SolidBrush(new Color(50, 50, 50))
            };
            btnLeave.Content = new Label { Text = "Leave Conversation", Font = VentureGame.Instance.SmallFont, TextColor = Color.LightGray };
            btnLeave.Click += (s, e) =>
            {
                HandleHideDialogue();
            };
            optionsStack.Widgets.Add(btnLeave);

            mainLayout.Widgets.Add(optionsStack);
            dialog.Content = mainLayout;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void HandleHideDialogue()
        {
            if (_activeDialogueDialog != null)
            {
                _activeDialogueDialog.Close();
                _activeDialogueDialog = null;
            }
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
                VentureGame.Instance.Network.OnShowDialogue -= HandleShowDialogue;
                VentureGame.Instance.Network.OnHideDialogue -= HandleHideDialogue;
            }
        }
    }
}
