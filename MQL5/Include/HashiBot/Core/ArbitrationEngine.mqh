//+------------------------------------------------------------------+
//| ArbitrationEngine.mqh                                            |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_CORE_ARBITRATIONENGINE_MQH__
#define __HASHIBOT_CORE_ARBITRATIONENGINE_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>
#include <HashiBot/Strategies/StrategyTypes.mqh>
#include <HashiBot/Strategies/TrendContinuation.mqh>
#include <HashiBot/Strategies/CompressionBreakout.mqh>
#include <HashiBot/Strategies/PullbackContinuation.mqh>
#include <HashiBot/Strategies/ExpansionMomentum.mqh>

#define HASHIBOT_AMBIGUITY_THRESHOLD      0.04
#define HASHIBOT_MIN_REGIME_CONF_PERSONAL      0.38
#define HASHIBOT_MIN_REGIME_CONF_PROP          0.50
#define HASHIBOT_MIN_MARKET_QUALITY_PERSONAL   0.30
#define HASHIBOT_MIN_MARKET_QUALITY_PROP       0.42
#define HASHIBOT_MAX_SPREAD_POINTS_PERSONAL    85.0
#define HASHIBOT_MAX_SPREAD_POINTS_PROP        60.0
#define HASHIBOT_MIN_SCORE_PERSONAL            0.48
#define HASHIBOT_MIN_SCORE_PROP                0.70
#define HASHIBOT_MIN_GRADE_PERSONAL            SIGNAL_GRADE_B
#define HASHIBOT_MIN_GRADE_PROP                SIGNAL_GRADE_A

class CArbitrationEngine
  {
private:
   bool                          m_initialized;
   StrategyCandidate             m_candidates[HASHIBOT_MAX_CANDIDATES];
   int                           m_candidateCount;
   int                           m_invalidByStrategy[HASHIBOT_MAX_CANDIDATES+1];
   int                           m_validDirByStrategy[HASHIBOT_MAX_CANDIDATES+1];
   int                           m_ambiguousDirByStrategy[HASHIBOT_MAX_CANDIDATES+1];
   int                           m_winnerDirValidByStrategy[HASHIBOT_MAX_CANDIDATES+1];
   int                           m_winnerPlanInvalidByStrategy[HASHIBOT_MAX_CANDIDATES+1];
   int                           m_noValidWinnerCount;
   CTrendContinuationStrategy    m_trend;
   CCompressionBreakoutStrategy  m_compression;
   CPullbackContinuationStrategy m_pullback;
   CExpansionMomentumStrategy    m_expansion;
   ProfileType                   m_profile;

private:
   SignalGrade GradeFromScore(const double score) const
     {
      if(score >= 0.85) return SIGNAL_GRADE_A_PLUS;
      if(score >= 0.70) return SIGNAL_GRADE_A;
      if(score >= 0.55) return SIGNAL_GRADE_B;
      return SIGNAL_GRADE_REJECT;
     }

   void AddCandidateIfValid(const StrategyCandidate &c)
     {
      if(m_candidateCount >= HASHIBOT_MAX_CANDIDATES)
         return;
      m_candidates[m_candidateCount] = c;
     m_candidateCount++;
     }

   int StrategyBucket(const StrategyType st) const
     {
      if(st == STRATEGY_TREND_CONTINUATION) return 0;
      if(st == STRATEGY_PULLBACK_CONTINUATION) return 1;
      if(st == STRATEGY_COMPRESSION_BREAKOUT) return 2;
      if(st == STRATEGY_EXPANSION_MOMENTUM) return 3;
      return 4;
     }

   bool IsDirectionValid(const TradeDirection d) const { return (d == TRADE_DIR_LONG || d == TRADE_DIR_SHORT); }

   bool ValidateCandidate(const StrategyCandidate &c,string &reason) const
     {
      reason = "";
      if(c.strategy == STRATEGY_NONE) { reason = "invalid_strategy"; return false; }
      if(!IsDirectionValid(c.direction) || !IsDirectionValid(c.plan.direction)) { reason = "invalid_direction"; return false; }
      if(c.score.totalScore <= 0.0) { reason = "invalid_score"; return false; }
      if(c.grade == SIGNAL_GRADE_REJECT) { reason = "invalid_grade"; return false; }
      if(c.plan.entryPrice <= 0.0 || c.plan.stopLoss <= 0.0 || c.plan.takeProfit1 <= 0.0 || c.plan.takeProfit2 <= 0.0) { reason = "invalid_price_levels"; return false; }

      double riskDist = MathAbs(c.plan.entryPrice - c.plan.stopLoss);
      if(riskDist <= 0.0) { reason = "invalid_stop_distance"; return false; }
      double minDist = MathMax(2.0 * _Point, 1e-6);
      if(riskDist < minDist) { reason = "stop_distance_too_small"; return false; }

      if(c.plan.direction == TRADE_DIR_LONG)
        {
         if(c.plan.stopLoss >= c.plan.entryPrice || c.plan.takeProfit1 <= c.plan.entryPrice || c.plan.takeProfit2 <= c.plan.entryPrice) { reason = "invalid_long_sides"; return false; }
        }
      else
        {
         if(c.plan.stopLoss <= c.plan.entryPrice || c.plan.takeProfit1 >= c.plan.entryPrice || c.plan.takeProfit2 >= c.plan.entryPrice) { reason = "invalid_short_sides"; return false; }
        }

      double rewardDist = MathAbs(c.plan.takeProfit1 - c.plan.entryPrice);
      if(rewardDist < minDist) { reason = "reward_distance_too_small"; return false; }
      return true;
     }

   double ComputeCompositeScore(const StrategyCandidate &c) const
     {
      double regime = MathHelpers::Clamp(c.score.scoreRegime, 0.0, 1.0);
      double htf = MathHelpers::Clamp(c.score.scoreHTF, 0.0, 1.0);
      double ltf = MathHelpers::Clamp(c.score.scoreLTF, 0.0, 1.0);
      double vol = MathHelpers::Clamp(c.score.scoreVol, 0.0, 1.0);
      double entry = MathHelpers::Clamp(c.score.scoreEntry, 0.0, 1.0);
      double unique = MathHelpers::Clamp(c.score.scoreUnique, 0.0, 1.0);
      double suppression = MathHelpers::Clamp(c.score.scoreSuppression, 0.0, 1.0);

      // common comparable weighting across strategies
      double common = 0.20 * regime +
                      0.12 * htf +
                      0.12 * ltf +
                      0.14 * vol +
                      0.14 * entry +
                      0.14 * unique +
                      0.14 * (0.5 * htf + 0.5 * ltf) -
                      0.20 * suppression;

      // per-strategy interpretation bonus
      double bonus = 0.0;
      if(c.strategy == STRATEGY_TREND_CONTINUATION)
         bonus = 0.08 * ((htf + regime + ltf) / 3.0);
      else if(c.strategy == STRATEGY_PULLBACK_CONTINUATION)
         bonus = 0.08 * ((htf + entry + ltf) / 3.0);
      else if(c.strategy == STRATEGY_COMPRESSION_BREAKOUT)
         bonus = 0.08 * ((htf + ltf + entry) / 3.0);
      else if(c.strategy == STRATEGY_EXPANSION_MOMENTUM)
         bonus = 0.08 * ((htf + ltf + unique) / 3.0);

      return MathHelpers::Clamp(common + bonus, 0.0, 1.0);
     }

   void ApplyRegimePreference(const RegimeState &regime,StrategyCandidate &c) const
     {
      double b = 0.0;
      if(regime.regime == REGIME_TREND_UP || regime.regime == REGIME_TREND_DOWN)
        {
         if(c.strategy == STRATEGY_TREND_CONTINUATION || c.strategy == STRATEGY_PULLBACK_CONTINUATION) b = 0.03;
         if(c.strategy == STRATEGY_EXPANSION_MOMENTUM) b = -0.01;
        }
      else if(regime.regime == REGIME_COMPRESSION)
        {
         if(c.strategy == STRATEGY_COMPRESSION_BREAKOUT) b = 0.04;
         else b = -0.02;
        }
      else if(regime.regime == REGIME_EXPANSION)
        {
         if(c.strategy == STRATEGY_EXPANSION_MOMENTUM) b = 0.04;
         else if(c.strategy == STRATEGY_COMPRESSION_BREAKOUT) b = 0.01;
         else b = -0.01;
        }
      c.score.totalScore = MathHelpers::Clamp(c.score.totalScore + b, 0.0, 1.0);
     }

public:
   CArbitrationEngine(void)
     {
      m_initialized = false;
      m_profile = PROFILE_PERSONAL;
      Reset();
     }

   bool Init(ProfileType profile=PROFILE_PERSONAL)
     {
      m_profile = (profile == PROFILE_PROP_FIRM ? PROFILE_PROP_FIRM : PROFILE_PERSONAL);
      m_initialized = true;
      m_trend.Init(m_profile);
      m_compression.Init(m_profile);
      m_pullback.Init(m_profile);
      m_expansion.Init(m_profile);
      Reset();
      return true;
     }

   void Reset()
     {
      m_candidateCount = 0;
      m_noValidWinnerCount = 0;
      for(int j=0; j<=HASHIBOT_MAX_CANDIDATES; j++)
        {
         m_invalidByStrategy[j] = 0;
         m_validDirByStrategy[j] = 0;
         m_ambiguousDirByStrategy[j] = 0;
         m_winnerDirValidByStrategy[j] = 0;
         m_winnerPlanInvalidByStrategy[j] = 0;
        }
      for(int i = 0; i < HASHIBOT_MAX_CANDIDATES; i++)
         m_candidates[i].Reset();
      m_trend.Reset();
      m_compression.Reset();
      m_pullback.Reset();
      m_expansion.Reset();
     }

   void ScoreCandidate(StrategyCandidate &candidate)
     {
      candidate.score.totalScore = ComputeCompositeScore(candidate);
      candidate.grade = GradeFromScore(candidate.score.totalScore);
      candidate.plan.grade = candidate.grade;
      candidate.plan.confidence = candidate.score.totalScore;

      bool planComplete = StrategyTypes::IsTradePlanComplete(candidate.plan);
      candidate.isValid = (candidate.grade != SIGNAL_GRADE_REJECT && !candidate.suppression.isHardSuppressed && planComplete);
     }

   bool HasAmbiguity() const
     {
      if(m_candidateCount < 2)
         return false;
      int best = -1, second = -1;
      for(int i = 0; i < m_candidateCount; i++)
        {
         if(best < 0 || m_candidates[i].score.totalScore > m_candidates[best].score.totalScore)
           { second = best; best = i; }
         else if(second < 0 || m_candidates[i].score.totalScore > m_candidates[second].score.totalScore)
            second = i;
        }
      if(best < 0 || second < 0)
         return false;
      return (MathAbs(m_candidates[best].score.totalScore - m_candidates[second].score.totalScore) < HASHIBOT_AMBIGUITY_THRESHOLD);
     }

   int SelectWinner() const
     {
      int idx = -1;
      double best = -1.0;
      for(int i = 0; i < m_candidateCount; i++)
        {
         if(!m_candidates[i].isValid)
            continue;
         if(m_candidates[i].score.totalScore > best)
           { best = m_candidates[i].score.totalScore; idx = i; }
        }
      return idx;
     }

   ArbitrationResult Evaluate(const MarketContext &ctx,const RegimeState &regime)
     {
      if(!m_initialized)
         Init();

      Reset();
      ArbitrationResult result;
      result.Reset();

      if(regime.suppression.isSuppressed)
        {
         result.reason = "regime_suppressed";
         result.suppression = regime.suppression;
        }
      double minRegimeConf = (m_profile == PROFILE_PROP_FIRM ? HASHIBOT_MIN_REGIME_CONF_PROP : HASHIBOT_MIN_REGIME_CONF_PERSONAL);
      double requiredMarketQuality = (m_profile == PROFILE_PROP_FIRM ? HASHIBOT_MIN_MARKET_QUALITY_PROP : HASHIBOT_MIN_MARKET_QUALITY_PERSONAL);
      double maxSpread = (m_profile == PROFILE_PROP_FIRM ? HASHIBOT_MAX_SPREAD_POINTS_PROP : HASHIBOT_MAX_SPREAD_POINTS_PERSONAL);
      SignalGrade minGrade = (m_profile == PROFILE_PROP_FIRM ? HASHIBOT_MIN_GRADE_PROP : HASHIBOT_MIN_GRADE_PERSONAL);
      double minTopScore = (m_profile == PROFILE_PROP_FIRM ? HASHIBOT_MIN_SCORE_PROP : HASHIBOT_MIN_SCORE_PERSONAL);

      if(regime.confidence < minRegimeConf)
        { result.noTrade = true; result.reason = "low_regime_confidence"; }
      if(ctx.marketQuality < requiredMarketQuality)
        { result.noTrade = true; result.reason = "low_market_quality"; }
      if(ctx.spreadPoints <= 0.0 || ctx.spreadPoints > maxSpread)
        { result.noTrade = true; result.reason = "extreme_spread"; }

      StrategyCandidate c;
      m_trend.Analyze(ctx, regime, c);       ScoreCandidate(c); ApplyRegimePreference(regime, c); {
         int b=StrategyBucket(c.strategy); string vreason="";
         if(IsDirectionValid(c.direction)) m_validDirByStrategy[b]++; else m_ambiguousDirByStrategy[b]++;
         if(c.isValid && ValidateCandidate(c, vreason)) AddCandidateIfValid(c);
         else { m_invalidByStrategy[b]++; Print(StringFormat("[ARB_REJECT] strategy=%s reason=invalid_candidate:%s dir=%s score=%.2f entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",StrategyTypes::StrategyName(c.strategy),vreason,StrategyTypes::DirectionName(c.plan.direction),c.score.totalScore,c.plan.entryPrice,c.plan.stopLoss,c.plan.takeProfit1,c.plan.takeProfit2)); }
      }
      m_pullback.Analyze(ctx, regime, c);    ScoreCandidate(c); ApplyRegimePreference(regime, c); {
         int b=StrategyBucket(c.strategy); string vreason="";
         if(IsDirectionValid(c.direction)) m_validDirByStrategy[b]++; else m_ambiguousDirByStrategy[b]++;
         if(c.isValid && ValidateCandidate(c, vreason)) AddCandidateIfValid(c);
         else { m_invalidByStrategy[b]++; Print(StringFormat("[ARB_REJECT] strategy=%s reason=invalid_candidate:%s dir=%s score=%.2f entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",StrategyTypes::StrategyName(c.strategy),vreason,StrategyTypes::DirectionName(c.plan.direction),c.score.totalScore,c.plan.entryPrice,c.plan.stopLoss,c.plan.takeProfit1,c.plan.takeProfit2)); }
      }
      m_compression.Analyze(ctx, regime, c); ScoreCandidate(c); ApplyRegimePreference(regime, c); {
         int b=StrategyBucket(c.strategy); string vreason="";
         if(IsDirectionValid(c.direction)) m_validDirByStrategy[b]++; else m_ambiguousDirByStrategy[b]++;
         if(c.isValid && ValidateCandidate(c, vreason)) AddCandidateIfValid(c);
         else { m_invalidByStrategy[b]++; Print(StringFormat("[ARB_REJECT] strategy=%s reason=invalid_candidate:%s dir=%s score=%.2f entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",StrategyTypes::StrategyName(c.strategy),vreason,StrategyTypes::DirectionName(c.plan.direction),c.score.totalScore,c.plan.entryPrice,c.plan.stopLoss,c.plan.takeProfit1,c.plan.takeProfit2)); }
      }
      m_expansion.Analyze(ctx, regime, c);   ScoreCandidate(c); ApplyRegimePreference(regime, c); {
         int b=StrategyBucket(c.strategy); string vreason="";
         if(IsDirectionValid(c.direction)) m_validDirByStrategy[b]++; else m_ambiguousDirByStrategy[b]++;
         if(c.isValid && ValidateCandidate(c, vreason)) AddCandidateIfValid(c);
         else { m_invalidByStrategy[b]++; Print(StringFormat("[ARB_REJECT] strategy=%s reason=invalid_candidate:%s dir=%s score=%.2f entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",StrategyTypes::StrategyName(c.strategy),vreason,StrategyTypes::DirectionName(c.plan.direction),c.score.totalScore,c.plan.entryPrice,c.plan.stopLoss,c.plan.takeProfit1,c.plan.takeProfit2)); }
      }

      result.candidateCount = m_candidateCount;
      for(int i = 0; i < m_candidateCount && i < HASHIBOT_MAX_CANDIDATES; i++)
         result.candidates[i] = m_candidates[i];

      if(m_candidateCount == 0)
        { result.noTrade = true; result.reason = "no_candidates"; Print("[ARB] no_valid_winner reason=no_valid_candidates"); return result; }
      if(regime.suppression.isSuppressed)
        { result.noTrade = true; if(result.reason == "") result.reason = "suppressed"; return result; }

      // ranking metrics
      int best=-1, second=-1;
      for(int k=0;k<m_candidateCount;k++)
        {
         if(best<0 || m_candidates[k].score.totalScore > m_candidates[best].score.totalScore)
           { second = best; best = k; }
         else if(second<0 || m_candidates[k].score.totalScore > m_candidates[second].score.totalScore)
           second = k;
        }

      if(best >= 0)
         result.topScore = m_candidates[best].score.totalScore;
      if(second >= 0)
         result.secondScore = m_candidates[second].score.totalScore;
      result.scoreMargin = MathMax(0.0, result.topScore - result.secondScore);

      if(result.topScore < minTopScore)
        { result.noTrade = true; result.reason = "top_score_below_profile_min"; return result; }
      if(result.scoreMargin < 0.01 && result.topScore < (minTopScore + 0.05))
        { result.noTrade = true; result.reason = "weak_top_and_low_margin"; return result; }
      if(HasAmbiguity())
        { result.scoreMargin = MathMax(0.0, result.scoreMargin - 0.02); result.reason = "ambiguous_top_scores_soft"; }

      int winner = SelectWinner();
      if(winner < 0)
        { result.noTrade = true; result.reason = "no_valid_winner"; m_noValidWinnerCount++; Print("[ARB] no_valid_winner reason=winner_selection_failed"); return result; }

      if(m_candidates[winner].grade < minGrade)
        { result.noTrade = true; result.reason = "grade_below_profile_min"; return result; }

      if(!StrategyTypes::IsTradePlanComplete(m_candidates[winner].plan))
        { result.noTrade = true; result.reason = "incomplete_trade_plan"; m_winnerPlanInvalidByStrategy[StrategyBucket(m_candidates[winner].strategy)]++; Print("[ARB] no_valid_winner reason=incomplete_trade_plan"); return result; }
      m_winnerDirValidByStrategy[StrategyBucket(m_candidates[winner].strategy)]++;

      // placeholder duplicate/cooldown/active-trade guards
      bool oneActiveTradePerSymbolPlaceholder = false;
      bool duplicateSignalPlaceholder = false;
      bool cooldownPlaceholder = false;
      if(oneActiveTradePerSymbolPlaceholder || duplicateSignalPlaceholder || cooldownPlaceholder)
        { result.noTrade = true; result.reason = "symbol_duplicate_or_cooldown"; return result; }

      result.hasWinner = true;
      result.noTrade = false;
      result.winningStrategy = m_candidates[winner].strategy;
      result.winningScore = m_candidates[winner].score.totalScore;
      result.winningGrade = m_candidates[winner].grade;
      result.confidence = result.winningScore;
      result.winnerType = result.winningStrategy;
      result.grade = result.winningGrade;
      result.plan = m_candidates[winner].plan;
      result.reason = "ok";
      return result;
     }

   string Describe(const ArbitrationResult &result)
     {
      string csum = "";
      for(int i = 0; i < result.candidateCount && i < HASHIBOT_MAX_CANDIDATES; i++)
        {
         if(i > 0) csum += "|";
         csum += StrategyTypes::StrategyName(result.candidates[i].strategy) + ":" + DoubleToString(result.candidates[i].score.totalScore, 2);
        }

      return StringFormat("arb no_trade=%s n=%d top=%.2f second=%.2f margin=%.2f winner=%s grade=%s dir=%d e=%.5f sl=%.5f tp1=%.5f tp2=%.5f reason=%s cand=[%s]",
                          (result.noTrade ? "true" : "false"),
                          result.candidateCount,
                          result.topScore,
                          result.secondScore,
                          result.scoreMargin,
                          StrategyTypes::StrategyName(result.winningStrategy),
                          StrategyTypes::GradeToString(result.winningGrade),
                          (int)result.plan.direction,
                          result.plan.entryPrice,
                          result.plan.stopLoss,
                          result.plan.takeProfit1,
                          result.plan.takeProfit2,
                          result.reason,
                          csum);
     }
  };

#endif
