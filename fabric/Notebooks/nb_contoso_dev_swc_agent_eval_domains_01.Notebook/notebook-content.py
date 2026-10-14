# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "__ID:lh_contoso_dev_swc_evaluation_01__",
# META       "default_lakehouse_name": "lh_contoso_dev_swc_evaluation_01",
# META       "default_lakehouse_workspace_id": "__WORKSPACE_ID__",
# META       "known_lakehouses": [
# META         {
# META           "id": "__ID:lh_contoso_dev_swc_evaluation_01__"
# META         },
# META         {
# META           "id": "__GOLD_LAKEHOUSE_ID__"
# META         }
# META       ]
# META     }
# META   }
# META }

# MARKDOWN ********************

# # Contoso data agent evaluation: domain agents
#
# Checks how well each domain data agent answers questions about its own domain.
#
# | Agent | Questions about |
# | --- | --- |
# | `da_contoso_dev_swc_planning_01` | Hours booked, activities, critical path |
# | `da_contoso_dev_swc_procurement_01` | Order value, suppliers, delivery performance |
# | `da_contoso_dev_swc_maintenance_01` | Work orders, cost, downtime, contractors |
#
# ## How it works
#
# 1. **Ground truth.** Each question has a SQL query on the gold lakehouse. The notebook runs it, so the expected answer always matches the data.
# 2. **Ask.** The Fabric data agent SDK sends every question to the agent, as a user would.
# 3. **Grade.** An LLM grader compares the agent answer with the expected answer: correct, wrong or unclear.
# 4. **Report.** A scorecard per agent, a chart, and every wrong answer with a link to the agent's thread.
#
# Run one evaluation notebook at a time. Two at once hit the grader's rate limit, and those answers come back as unclear.
#
# Preview: the evaluation SDK is in preview. Live telemetry questions are left out because their answer changes every second.
#
# Results are saved in `lh_contoso_dev_swc_evaluation_01`, so every run can be compared with the last one.

# MARKDOWN ********************

# ## 1. Install the SDK

# CELL ********************

%pip install -q -U fabric-data-agent-sdk

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 2. Settings
#
# `STAGE` picks which version of each agent to test:
#
# - `sandbox`: the draft you see in the editor, including changes you have not published.
# - `production`: the published version that users and Copilot get.
#
# `STAGE` is a parameter cell, so a scheduled or pipeline run can override it.

# PARAMETERS CELL ********************

STAGE = "sandbox"

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# CELL ********************

AGENTS = {
    "da_contoso_dev_swc_planning_01": "planning",
    "da_contoso_dev_swc_procurement_01": "procurement",
    "da_contoso_dev_swc_maintenance_01": "maintenance"
}

GOLD_LAKEHOUSE = "lh_contoso_dev_swc_gold_01"
RESULTS_PREFIX = "eval"
HISTORY_TABLE = "eval_scorecard_history"
NOTEBOOK = "nb_contoso_dev_swc_agent_eval_domains_01"

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 3. Questions
#
# Each question comes with the SQL that produces the correct answer.

# CELL ********************

QUESTION_SETS = {
    'planning': [
        ('How many hours have been booked in total?',
         'SELECT ROUND(SUM(hours_booked_in_week), 0) AS total_hours_booked FROM fact_activity_progress',
         'single domain'),
        ('Which project has the most hours booked, and how many?',
         'SELECT p.project_name, ROUND(SUM(f.hours_booked_in_week), 0) AS hours_booked FROM fact_activity_progress f JOIN dim_project p ON f.project_key = p.project_key GROUP BY p.project_name ORDER BY hours_booked DESC LIMIT 1',
         'single domain'),
        ('Which country has the most hours booked?',
         'SELECT p.country_code, ROUND(SUM(f.hours_booked_in_week), 0) AS hours_booked FROM fact_activity_progress f JOIN dim_project p ON f.project_key = p.project_key GROUP BY p.country_code ORDER BY hours_booked DESC LIMIT 1',
         'single domain'),
        ('How many activities are on the critical path?',
         'SELECT COUNT(*) AS critical_path_activities FROM dim_activity WHERE is_critical_path = true',
         'single domain'),
        ('Which discipline has the most baseline hours?',
         'SELECT d.discipline_name, ROUND(SUM(a.planned_hours), 0) AS baseline_hours FROM dim_activity a JOIN dim_discipline d ON a.discipline_key = d.discipline_key WHERE a.activity_key IN (SELECT activity_key FROM fact_activity_progress) GROUP BY d.discipline_name ORDER BY baseline_hours DESC LIMIT 1',
         'single domain'),
        ('How many projects are in execution?',
         "SELECT COUNT(*) AS projects_in_execution FROM dim_project WHERE project_status = 'Execution'",
         'single domain'),
    ],
    'procurement': [
        ('What is the total order value in NOK?',
         'SELECT ROUND(SUM(line_amount_nok), 0) AS order_value_nok FROM fact_purchase_order_line',
         'single domain'),
        ('What is the open order value in NOK?',
         "SELECT ROUND(SUM(line_amount_nok), 0) AS open_order_value_nok FROM fact_purchase_order_line WHERE line_status = 'Open'",
         'single domain'),
        ('How many purchase orders are there?',
         'SELECT COUNT(DISTINCT purchase_order_id) AS purchase_orders FROM fact_purchase_order_line',
         'single domain'),
        ('Which supplier has the most late delivered order lines?',
         'SELECT s.supplier_name, COUNT(*) AS late_lines FROM fact_purchase_order_line l JOIN dim_supplier s ON l.supplier_key = s.supplier_key WHERE l.is_late_delivery = 1 GROUP BY s.supplier_name ORDER BY late_lines DESC LIMIT 1',
         'single domain'),
        ('What share of delivered order lines arrived on time?',
         "SELECT CONCAT(CAST(ROUND(100.0 * (SUM(is_delivered) - SUM(is_late_delivery)) / SUM(is_delivered), 1) AS STRING), '%') AS on_time_percent FROM fact_purchase_order_line",
         'single domain'),
        ('Which supplier country has the highest order value in NOK?',
         'SELECT s.country_code, ROUND(SUM(l.line_amount_nok), 0) AS order_value_nok FROM fact_purchase_order_line l JOIN dim_supplier s ON l.supplier_key = s.supplier_key GROUP BY s.country_code ORDER BY order_value_nok DESC LIMIT 1',
         'single domain'),
    ],
    'maintenance': [
        ('How many work orders are there in total?',
         'SELECT COUNT(*) AS work_orders FROM fact_work_order',
         'single domain'),
        ('How many corrective work orders are there?',
         'SELECT COUNT(*) AS corrective_work_orders FROM fact_work_order WHERE is_corrective = 1',
         'single domain'),
        ('Which installation has the highest total maintenance cost in NOK, and what is that cost?',
         'SELECT i.installation_name, ROUND(SUM(w.total_cost_nok), 0) AS total_cost_nok FROM fact_work_order w JOIN dim_installation i ON w.installation_key = i.installation_key GROUP BY i.installation_name ORDER BY total_cost_nok DESC LIMIT 1',
         'single domain'),
        ('Which contractor has carried out the most work orders?',
         'SELECT s.supplier_name AS contractor, COUNT(*) AS work_orders FROM fact_work_order w JOIN dim_supplier s ON w.contractor_supplier_key = s.supplier_key WHERE w.contractor_supplier_key > 0 GROUP BY s.supplier_name ORDER BY work_orders DESC LIMIT 1',
         'single domain'),
        ('Which failure mode caused the most downtime hours on corrective work orders?',
         'SELECT failure_mode, ROUND(SUM(downtime_hours), 1) AS downtime_hours FROM fact_work_order WHERE is_corrective = 1 GROUP BY failure_mode ORDER BY downtime_hours DESC LIMIT 1',
         'single domain'),
        ('How many safety-critical work orders are planned or in progress?',
         "SELECT COUNT(*) AS safety_critical_open FROM fact_work_order WHERE is_safety_critical = true AND work_order_status IN ('Planned', 'In progress')",
         'single domain'),
        ('What is the average number of days to complete a work order?',
         'SELECT ROUND(AVG(days_to_complete), 1) AS avg_days_to_complete FROM fact_work_order WHERE days_to_complete IS NOT NULL',
         'single domain'),
    ],
}

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 4. Ground truth
#
# Runs every SQL query on the gold lakehouse and turns the result into a short expected answer.

# CELL ********************

import pandas as pd

for table in ['dim_date', 'dim_project', 'dim_discipline', 'dim_resource', 'dim_activity', 'dim_installation', 'dim_equipment', 'dim_supplier', 'dim_material', 'dim_cost_code', 'fact_activity_progress', 'fact_work_order', 'fact_purchase_order_line', 'wb_hours_forecast']:
    spark.table(f"{GOLD_LAKEHOUSE}.{table}").createOrReplaceTempView(table)


def fmt(value):
    if isinstance(value, (int, float)) or type(value).__name__ == "Decimal":
        number = float(value)
        return f"{number:,.0f}" if number == int(number) else f"{number:,.1f}"
    return str(value)


def expected_answer(sql):
    rows = spark.sql(sql).collect()
    return "; ".join(", ".join(fmt(v) for v in row) for row in rows)


ground_truth = {
    name: pd.DataFrame(
        [(q, expected_answer(sql), group) for q, sql, group in questions],
        columns=["question", "expected_answer", "group"],
    )
    for name, questions in QUESTION_SETS.items()
}

for name, df in ground_truth.items():
    print(f"{name}: {len(df)} questions")
    display(df)

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 5. Ask the agents
#
# Sends every question to every agent and grades the answers. This takes about a minute per question.
#
# The grader prompt below is stricter than the default on refusals and more lenient on number formatting.
# In this SDK version the grader reads the agent answer from the thread, so the prompt uses only `{query}` and `{expected_answer}`.

# CELL ********************

from datetime import datetime, timezone
from fabric.dataagent.evaluation import evaluate_data_agent

CRITIC_PROMPT = 'Grade the most recent answer in this conversation against a known correct answer.\n\nQuestion: {query}\n\nCorrect answer: {expected_answer}\n\nRules:\n- The answer is correct when it contains the same facts as the correct answer.\n- Numbers count as the same when they are within 1 percent of each other. Ignore formatting, units, rounding and thousand separators.\n- Names must match, but ignore letter case and small spelling differences.\n- Extra detail is fine, as long as it does not contradict the correct answer.\n- If the answer says it cannot answer, or asks a clarifying question instead of answering, it is not correct.\n\nReturn only one word: Yes if the answer is correct, No if it is wrong, Unclear if you cannot tell.'

run_time = datetime.now(timezone.utc)
runs = {}
for agent, question_set in AGENTS.items():
    table = f"{RESULTS_PREFIX}_{agent.replace('da_contoso_dev_swc_', '').removesuffix('_01')}"
    print(f"Evaluating {agent} ({STAGE}) ...")
    try:
        runs[agent] = (table, evaluate_data_agent(
            ground_truth[question_set][["question", "expected_answer"]],
            agent,
            table_name=table,
            data_agent_stage=STAGE,
            critic_prompt=CRITIC_PROMPT,
        ))
        print(f"  done, evaluation id {runs[agent][1]}")
    except Exception as e:
        print(f"  failed: {e}")

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 6. Scorecard
#
# One row per agent. Accuracy is correct answers divided by all questions.

# CELL ********************

from pyspark.sql import functions as F
from fabric.dataagent.evaluation import get_evaluation_details

if not runs:
    raise RuntimeError("No evaluation finished. Read the messages in step 5.")

results = []
for agent, (table, evaluation_id) in runs.items():
    df = get_evaluation_details(evaluation_id, table, get_all_rows=True, verbose=False)
    df["agent"] = agent
    results.append(df)
results = pd.concat(results, ignore_index=True)

question_group = {q: g for df in ground_truth.values() for q, g in zip(df["question"], df["group"])}
results["group"] = results["question"].map(question_group)
results["verdict"] = results["evaluation_judgement"].map({True: "correct", False: "wrong"}).fillna("unclear")

scorecard = (
    results.groupby("agent")
    .agg(
        questions=("question", "count"),
        correct=("verdict", lambda v: (v == "correct").sum()),
        wrong=("verdict", lambda v: (v == "wrong").sum()),
        unclear=("verdict", lambda v: (v == "unclear").sum()),
        avg_seconds=("execution_time_sec", "mean"),
    )
    .reset_index()
)
scorecard["accuracy"] = (scorecard["correct"] / scorecard["questions"]).round(3)
scorecard["avg_seconds"] = scorecard["avg_seconds"].round(1)
scorecard = scorecard[["agent", "questions", "correct", "wrong", "unclear", "accuracy", "avg_seconds"]]
display(scorecard)

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 7. Chart

# CELL ********************

import matplotlib.pyplot as plt

chart = scorecard.set_index("agent")[["correct", "wrong", "unclear"]]
ax = chart.plot.barh(stacked=True, figsize=(8, 3), color=["#2e8540", "#d83933", "#b0b0b0"])
ax.set_xlabel("Questions")
ax.set_ylabel("")
ax.set_title("Answers per agent")
ax.invert_yaxis()
plt.tight_layout()
plt.show()

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 8. Question by question

# CELL ********************

display(results[["agent", "question", "expected_answer", "verdict", "execution_time_sec"]].sort_values(["agent", "verdict"]))

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 9. What went wrong
#
# Every answer that was not correct, with the agent's full answer and a link to its thread.
# Open the thread to see the steps and the query the agent generated. Only the person who ran the evaluation can open it.

# CELL ********************

misses = results[results["verdict"] != "correct"][["agent", "question", "expected_answer", "actual_answer", "verdict", "thread_url"]]
if misses.empty:
    print("All answers were correct.")
else:
    display(misses)

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 10. Save the scorecard
#
# Appends this run to `eval_scorecard_history`, so you can see whether changes to instructions, examples or the ontology help over time.

# CELL ********************

history = scorecard.assign(run_time=run_time, notebook=NOTEBOOK, stage=STAGE)
spark.createDataFrame(history).write.mode("append").option("mergeSchema", "true").saveAsTable(HISTORY_TABLE)
display(spark.table(HISTORY_TABLE).orderBy(F.col("run_time").desc()).limit(20))

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## Improving a score
#
# | What you see | What to try |
# | --- | --- |
# | Wrong number, right idea | Add an example query for that kind of question, or a clearer column description. |
# | Wrong table or source | Make the agent instructions say which source to use for which question. |
# | Agent says it cannot answer | The data is not in its sources. For cross-domain questions, that is what the ontology fixes. |
# | Unclear | Read the answer. The question or the expected answer may be ambiguous. |
